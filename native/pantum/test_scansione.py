"""Test sintetici: non caricano DLL e non acquisiscono documenti."""
import ctypes as C
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from pypdf import PdfReader
import scansione as scan


def header(width=4, height=2, stride=4, depth=8, dpi=150):
    value = bytearray(128)
    value[2] = depth
    struct.pack_into("<HIII", value, 18, dpi, stride, width, height)
    return bytes(value)


class FakeDriver:
    def __init__(self, packets):
        self.packets = iter(packets)

    def lld_read_scan(self, handle, buffer, size, count, page_end, job_end):
        code, data, page, job = next(self.packets)
        C.memmove(buffer, data, len(data))
        count._obj.value = len(data)
        page_end._obj.value, job_end._obj.value = page, job
        return code


class ScanTests(unittest.TestCase):
    def test_parameters_pixels_and_dpi(self):
        for dpi in (150, 300, 600):
            params = scan._parameters(dpi)
            self.assertEqual(len(params), 1108)
            self.assertEqual(params[:2], b"\0\2")
            self.assertEqual(struct.unpack_from("<HH", params, 4), (dpi, dpi))
            width, height = struct.unpack_from("<II", params, 20)
            self.assertEqual(width % 4, 0)
            self.assertAlmostEqual(width / dpi * 25.4, 210, delta=1)
            self.assertAlmostEqual(height / dpi * 25.4, 297, delta=1)
        for dpi in (True, 0, 1200, "150", 150.0):
            with self.assertRaises(scan.ScannerError):
                scan._parameters(dpi)

    def test_header_limits(self):
        self.assertEqual(scan._image_info(header(width=4960, height=7016, stride=4960, dpi=600), 600), (4960, 7016, 4960))
        self.assertEqual(scan._image_info(header(), 150), (4, 2, 4))
        for value in (b"", header(width=0), header(height=10000), header(stride=1),
                      header(depth=24), header(dpi=300)):
            with self.assertRaises(scan.ScannerError):
                scan._image_info(value, 150)

    def test_stream_header_is_not_pixel_data(self):
        dll = FakeDriver([(0xF3, header(), 0, 0), (0xFF, b"", 0, 0),
                          (0, b"1234", 0, 0), (0, b"5678", 1, 1)])
        geometry, pixels = scan._read_page(dll, None, 150)
        self.assertEqual(geometry, (4, 2, 4))
        self.assertEqual(pixels, b"12345678")

    def test_rejects_corrupt_and_incomplete_streams(self):
        cases = [
            [(0, b"data", 0, 0)],
            [(0xF3, header(), 0, 0), (0, b"123", 1, 1)],
            [(0xF3, header(), 0, 0), (0, b"123456789", 1, 1)],
            [(0xF3, header(), 0, 0), (0xF3, header(), 0, 0)],
            [(14, b"", 0, 0)],
            [(0xFF, b"wrong", 0, 0)],
        ]
        for packets in cases:
            with self.subTest(packets=packets), self.assertRaises(scan.ScannerError):
                scan._read_page(FakeDriver(packets), None, 150)

    def test_parent_timeout_and_invalid_pdf(self):
        with patch.object(scan.subprocess, "run", side_effect=subprocess.TimeoutExpired("worker", 125)):
            with self.assertRaisesRegex(scan.ScannerError, "Timeout"):
                scan.scansiona_pdf()
        with patch.object(scan.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, b"", b"")):
            with self.assertRaisesRegex(scan.ScannerError, "assente"):
                scan.scansiona_pdf()
        with patch.object(scan.subprocess, "run") as run:
            with self.assertRaises(scan.ScannerError):
                scan.scansiona_pdf(colore=True)
            run.assert_not_called()
        with patch.object(scan.subprocess, "run", side_effect=OSError("process unavailable")):
            with self.assertRaisesRegex(scan.ScannerError, "processo/file"):
                scan.scansiona_pdf()

    def test_worker_pdf_and_cleanup(self):
        class Driver:
            calls = []
            def lld_open_device(self, descriptor, handle):
                handle._obj.value = 123
                return 0
            def lld_set_scan_param(self, *args): return 0
            def lld_start_scan(self, *args): return 0
            def lld_cancel_scan(self, *args): self.calls.append("cancel"); return 0
            def lld_close_device(self, *args): self.calls.append("close"); return 0
        dll = Driver()
        with tempfile.TemporaryDirectory() as folder, patch.object(scan, "_driver", return_value=dll), \
                patch.object(scan, "_selected_device", return_value=("model", "ip", bytes(608))), \
                patch.object(scan, "_read_page", return_value=((4, 2, 4), bytes(8))):
            destination = Path(folder) / "scan.pdf"
            scan._scan_worker(150, destination)
            self.assertEqual(len(PdfReader(destination).pages), 1)
            self.assertEqual(dll.calls, ["cancel", "close"])
            dll.calls.clear()
            with patch.object(scan, "_read_page", side_effect=scan.ScannerError("test failure")):
                with self.assertRaises(scan.ScannerError):
                    scan._scan_worker(150, destination)
            self.assertEqual(dll.calls, ["cancel", "close"])


if __name__ == "__main__":
    unittest.main()
