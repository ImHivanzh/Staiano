"""Pantum BM4240ADW: API native, senza interfaccia Pantum.

ADF verificato su hardware a 150 DPI. Una pagina A4, grigio, 150/300 DPI.
"""
import ctypes as C
import hashlib
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import tempfile
import time

SCANNER_HOST = "192.168.178.239"
DLL_PATH = Path(r"C:\Program Files\Pantum\bm4200\SCANNER\bm4200AMD64\bm4200lldx64.dll")
DLL_SHA256 = "837dd8dfbe24efd61360d68e4b04e6b5d3bd4afeeb4f8ab1474d99be294ee8d2"
MAX_IMAGE_BYTES = 32 * 1024 * 1024


class ScannerError(RuntimeError):
    pass


def scanner_info():
    return {"modello": "BM4240ADW", "sorgenti": ["piano", "adf"],
            "dpi": [150, 300], "colore": False}


def _driver():
    if sys.platform != "win32" or C.sizeof(C.c_void_p) != 8:
        raise ScannerError("Richiesto Python Windows a 64 bit.")
    if hashlib.sha256(DLL_PATH.read_bytes()).hexdigest() != DLL_SHA256:
        raise ScannerError("Driver diverso dalla versione analizzata: verificare nuovamente l'ABI.")
    directory = os.add_dll_directory(str(DLL_PATH.parent))
    dll = C.WinDLL(str(DLL_PATH))
    dll._search_directory = directory
    for name, args, result in [
        ("lld_find_devices", [C.c_ubyte, C.c_ubyte], C.c_int),
        ("lld_get_devices_list", [C.c_void_p, C.c_ubyte], C.c_int),
        ("lld_open_device", [C.c_void_p, C.POINTER(C.c_void_p)], C.c_ubyte),
        ("lld_get_device_ability", [C.c_void_p, C.c_void_p], C.c_ubyte),
        ("lld_get_scan_param", [C.c_void_p, C.c_void_p], C.c_ubyte),
        ("lld_get_adf_status", [C.c_void_p, C.POINTER(C.c_ubyte)], C.c_ubyte),
        ("lld_set_scan_param", [C.c_void_p, C.c_void_p], C.c_ubyte),
        ("lld_start_scan", [C.c_void_p], C.c_ubyte),
        ("lld_read_scan", [C.c_void_p, C.c_void_p, C.c_uint32,
                           C.POINTER(C.c_uint32), C.POINTER(C.c_ubyte),
                           C.POINTER(C.c_ubyte)], C.c_ubyte),
        ("lld_cancel_scan", [C.c_void_p], C.c_ubyte),
        ("lld_close_device", [C.c_void_p], C.c_ubyte),
    ]:
        function = getattr(dll, name)
        function.argtypes, function.restype = args, result
    return dll


def _check(code, operation):
    if code:
        raise ScannerError(f"{operation}: errore driver {code} (0x{code:02X}).")


def _devices(dll):
    count = dll.lld_find_devices(16, 2)  # Piattaforma BM4200, sola rete.
    if not 0 <= count <= 255:
        raise ScannerError(f"Ricerca scanner fallita: {count}.")
    buffer = C.create_string_buffer(608 * 255)
    count = dll.lld_get_devices_list(buffer, 255)
    if not 0 <= count <= 255:
        raise ScannerError(f"Elenco scanner non valido: {count}.")
    result = []
    for offset in range(0, count * 608, 608):
        raw = buffer.raw[offset:offset + 608]
        name = raw[:64].split(b"\0", 1)[0].decode("ascii", errors="replace")
        address = raw[64:320].split(b"\0", 1)[0].decode("ascii", errors="replace")
        if name.lower() == "bm4240adw series" and raw[324] == 2 and raw[326] == 16:
            result.append((name, address, raw))
    return result


def _selected_device(dll):
    addresses = {item[4][0].split("%", 1)[0]
                 for item in socket.getaddrinfo(SCANNER_HOST, None)}
    devices = [item for item in _devices(dll) if item[1].split("%", 1)[0] in addresses]
    if not devices:
        raise ScannerError("BM4240ADW non trovata agli indirizzi del nome configurato.")
    devices.sort(key=lambda item: (":" in item[1], item[1]))
    return devices[0]


def _parameters(dpi, sorgente="piano"):
    if type(dpi) is not int or dpi not in (150, 300):
        raise ScannerError("Risoluzione consentita: 150 oppure 300 DPI.")
    if sorgente not in ("piano", "adf"):
        raise ScannerError("Sorgente consentita: piano oppure adf.")
    params = bytearray(1108)
    params[0], params[1] = int(sorgente == "adf"), 2
    struct.pack_into("<HH", params, 4, dpi, dpi)
    width = round(210 / 25.4 * dpi) & ~3
    height = round(297 / 25.4 * dpi)
    struct.pack_into("<IIII", params, 12, 0, 0, width, height)
    params[0x24], params[0x25] = 128, 10
    return params


def _image_info(header, dpi):
    if len(header) != 128:
        raise ScannerError("Intestazione immagine incompleta.")
    depth = header[2]
    resolution, stride, width, height = struct.unpack_from("<HIII", header, 18)
    if (depth != 8 or resolution != dpi or not 0 < width <= 2600
            or not 0 < height <= 3600 or not width <= stride <= width + 16
            or stride * height > MAX_IMAGE_BYTES):
        raise ScannerError("Formato immagine inatteso: interrompere e verificare il driver.")
    return width, height, stride


def _read_page(dll, handle, dpi):
    buffer = C.create_string_buffer(256 * 1024)
    count, page_end, job_end = C.c_uint32(), C.c_ubyte(), C.c_ubyte()
    geometry, data = None, bytearray()
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        code = dll.lld_read_scan(handle, buffer, len(buffer), C.byref(count),
                                 C.byref(page_end), C.byref(job_end))
        if count.value > len(buffer):
            raise ScannerError("Il driver dichiara piu byte del buffer.")
        if code == 0xF3:
            if geometry is not None or data:
                raise ScannerError("Ricevuta una seconda pagina inattesa.")
            geometry = _image_info(buffer.raw[:count.value], dpi)
        elif code == 0xFF:
            if count.value:
                raise ScannerError("Dati inattesi durante attesa scanner.")
        else:
            _check(code, "Lettura scansione")
            if count.value:
                if geometry is None:
                    raise ScannerError("Pixel ricevuti prima dell'intestazione.")
                expected = geometry[1] * geometry[2]
                if len(data) + count.value > expected:
                    raise ScannerError("Dimensione immagine superiore al previsto.")
                data.extend(buffer.raw[:count.value])
            if job_end.value or page_end.value:
                if geometry is None or len(data) != geometry[1] * geometry[2]:
                    raise ScannerError("Scansione incompleta: PDF non generato.")
                return geometry, bytes(data)
        if not count.value:
            time.sleep(0.02)
    raise ScannerError("Timeout durante lettura scansione.")


def _scan_worker(dpi, destination, sorgente="piano"):
    from PIL import Image
    params = C.create_string_buffer(bytes(_parameters(dpi, sorgente)), 1108)
    dll = _driver()
    _, _, descriptor = _selected_device(dll)
    device = C.create_string_buffer(descriptor, 608)
    handle = C.c_void_p()
    _check(dll.lld_open_device(device, C.byref(handle)), "Apertura scanner")
    if not handle.value:
        raise ScannerError("Handle scanner nullo.")
    started = False
    try:
        _check(dll.lld_set_scan_param(handle, params), "Parametri scanner")
        if sorgente == "adf":
            status = C.c_ubyte()
            _check(dll.lld_get_adf_status(handle, C.byref(status)), "Stato vassoio")
            if status.value == 1:
                raise ScannerError("Vassoio vuoto: inserisci un foglio fino al rilevamento carta.")
            if status.value != 0:
                raise ScannerError("Stato del vassoio non riconosciuto.")
        started = True
        _check(dll.lld_start_scan(handle), "Avvio scansione")
        (width, height, stride), pixels = _read_page(dll, handle, dpi)
        # shortcut: una pagina per richiesta; aggiungere multipagina solo con flusso e limiti dedicati.
        with Image.frombytes("L", (width, height), pixels, "raw", "L", stride, 1) as image:
            image.save(destination, "PDF", resolution=float(dpi))
    finally:
        if started:
            dll.lld_cancel_scan(handle)
        dll.lld_close_device(handle)


def scansiona_pdf(dpi=150, colore=False, sorgente="piano"):
    _parameters(dpi, sorgente)
    if colore is not False:
        raise ScannerError("Questa versione acquisisce solo in grigio.")
    try:
        with tempfile.TemporaryDirectory(prefix="pantum-scan-") as folder:
            output = Path(folder) / "scansione.pdf"
            result = subprocess.run(
                [sys.executable, str(Path(__file__).resolve()), "--worker-scan", str(dpi), str(output), sorgente],
                capture_output=True, timeout=125, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            if result.returncode:
                detail = result.stderr.decode("utf-8", errors="replace").strip()
                raise ScannerError(detail[:500] or f"Processo scanner terminato: {result.returncode}.")
            if not output.exists() or not 5 < output.stat().st_size <= MAX_IMAGE_BYTES:
                raise ScannerError("PDF scanner assente o troppo grande.")
            data = output.read_bytes()
            if not data.startswith(b"%PDF-"):
                raise ScannerError("Risposta scanner non valida.")
            return data
    except subprocess.TimeoutExpired as error:
        raise ScannerError("Timeout scanner: processo interno terminato.") from error
    except OSError as error:
        raise ScannerError(f"Errore processo/file scanner: {error}.") from error


if __name__ == "__main__":
    try:
        if len(sys.argv) == 2 and sys.argv[1] == "--list":
            print(json.dumps([{"name": n, "address": a} for n, a, _ in _devices(_driver())]))
        elif len(sys.argv) == 5 and sys.argv[1] == "--worker-scan":
            _scan_worker(int(sys.argv[2]), Path(sys.argv[3]), sys.argv[4])
        else:
            print("Elenco senza scansione: python scansione.py --list")
    except (ScannerError, OSError, ValueError) as error:
        sys.stderr.buffer.write(str(error).encode("utf-8", errors="replace"))
        raise SystemExit(1)
