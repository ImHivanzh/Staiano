import { execFileSync } from "node:child_process";
import { test, expect } from "./browser-test";
import { openDisclosure } from "./ui-helpers";
import { exportPlenumFixture } from "./plenum-ui-fixture";

const cases = [
  ...["ZNV", "ZNVL", "ZNVV", "ZNVLV"].map((code) => ({
    kind: "radiator",
    family: `Nova Easy verticale ${code}`,
  })),
  { kind: "radiator", family: "Charleston 3 colonne", height: 600 },
  ...["VIP", "OSCAR", "OSCAR TONDO"].map((family) => ({
    kind: "radiator",
    family,
  })),
  { kind: "radiator", family: "Garda bianco", height: 1132 },
  { kind: "radiator", family: "Sanremo bianco dritto", height: 1110 },
  { kind: "split", family: "4 Way Cassette" },
  { kind: "split", family: "Round Cassette" },
  { kind: "split", family: "Mirror" },
  { kind: "split", family: "MSZ-LN" },
  ...["EDE1", "EDRA", "EDU", "EDQMQ", "EVVMC"].map((family) => ({
    kind: "terminal",
    family,
  })),
  ...["FCZ", "AirLeaf SL"].map((family) => ({ kind: "fanCoil", family })),
  ...["VERSATI V", "Altherma 3 H HT"].map((family) => ({
    kind: "heatPump",
    family,
  })),
  { kind: "ducted", family: "Mitsubishi Electric" },
];

for (const target of cases)
  test(`reconstruction ${target.kind} ${target.family} renders without changing installed data`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    const { project, selectionId } = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
      import {createProject,addRectangle} from './src/domain/project.ts';
      import {projectSchema} from './src/schemas/project.ts';
      import {ensureInstallations} from './src/domain/installations.ts';
      import {radiatorProducts} from './src/domain/catalogs/radiators.ts';
      import {getRadiatorFinishOptions} from './src/domain/catalogs/radiator-finishes.ts';
      import {sizeRadiators} from './src/domain/radiators/size.ts';
      import {applyRadiatorSolution} from './src/domain/radiators/apply.ts';
      import {applySplitSystem} from './src/domain/air-conditioning/apply.ts';
      import {usableSplitPlacement} from './src/domain/air-conditioning/size.ts';
      import {splitCatalog} from './src/domain/catalogs/splits.ts';
      import {airTerminalCatalog} from './src/domain/catalogs/air-terminals.ts';
      import {sizeAirTerminal} from './src/domain/air-terminals/size.ts';
      import {applyAirTerminalSolution} from './src/domain/air-terminals/apply.ts';
      import {fanCoilCatalog} from './src/domain/catalogs/fan-coils.ts';
      import {applyFanCoil} from './src/domain/fan-coils/apply.ts';
      import {heatPumpCatalog} from './src/domain/catalogs/heat-pumps.ts';
      import {applyHydronicSystem} from './src/domain/hydronic/apply.ts';
      import {applyDuctedSystem} from './src/domain/ducted/apply.ts';
      import {placeMachineOnPlan} from './src/domain/ducted/graphic-installation.ts';
      const target=${JSON.stringify(target)};
      let p=createProject(target.kind+' '+target.family);
      p=addRectangle(p,p.floors[0].id,{width:target.kind==='radiator'?2:3,length:target.kind==='radiator'?2:3,height:3,name:'Verifica'});
      let selectionId;
      if(target.kind==='radiator'){
        const variant=radiatorProducts.find(v=>v.family===target.family&&(!target.height||v.heightMm===target.height));
        const solution=sizeRadiators(p.rooms[0].designLoadW,[variant],50,{manufacturer:variant.manufacturer,family:variant.family,numberOfRadiators:1})[0];
        if(!solution) throw new Error('Fixture senza soluzione '+target.family);
        p=applyRadiatorSolution(p,p.rooms[0].id,solution,null);
        const colour=getRadiatorFinishOptions(variant.manufacturer,variant.family,'body').find(f=>/nero|black|9005/i.test(f.label));
        if(colour)p.radiators[0].finishes={bodyColorId:colour.id};
        selectionId=p.radiators[0].id;
      }else if(target.kind==='split'){
        const rectangular=target.family==='4 Way Cassette';
        if(rectangular)p=addRectangle(p,p.floors[0].id,{width:3,length:3,height:3,name:'Seconda stanza'});
        if(rectangular){
          // This documented combination has no per-unit simultaneous capacity: keep it explicitly unverifiable.
          const combination=splitCatalog.combinations.find(c=>c.id==='lg-mu2r15-mt06-ct09-cooling-heating');
          const indoorUnits=combination.indoorProductIds.map((id,i)=>{
            const unit=splitCatalog.indoorUnits.find(u=>u.id===id), room=p.rooms[i];
            const pose=usableSplitPlacement(p,room,unit);
            return {id:crypto.randomUUID(),roomId:room.id,floorId:room.floorId,wallId:null,mounting:unit.mounting,position:pose.position,rotation:pose.rotation,widthMm:unit.widthMm,heightMm:unit.heightMm,depthMm:unit.depthMm,productId:unit.id,catalogVersion:splitCatalog.version,locked:false};
          });
          p.hvacSystems=[{id:crypto.randomUUID(),type:'split',manufacturer:'LG',productId:combination.id,roomIds:p.rooms.map(r=>r.id),capacityW:combination.coolingCapacityW,airflowM3h:null,catalogVersion:splitCatalog.version,indoorUnits,outdoorUnit:null,compatibilityStatus:'unverifiable',linearPlan:null,decisionOrigin:'confirmed'}];
          p.rooms=p.rooms.map(r=>({...r,systemType:'split'}));
        }else if(target.family==='Round Cassette') p=applySplitSystem(p,p.rooms.map(r=>r.id),'LG',null,'lg-round-ut36f-uud1-u30-mono');
        else {
          // Use the indoor nominal rating for this body-only fixture, without declaring an approved outdoor combination.
          const unit=splitCatalog.indoorUnits.find(u=>u.family===target.family), room=p.rooms[0];
          const pose=usableSplitPlacement(p,room,unit);
          p.hvacSystems=[{id:crypto.randomUUID(),type:'split',manufacturer:unit.manufacturer,productId:'preview-unpaired-unit',roomIds:[room.id],capacityW:unit.nominalCoolingW,airflowM3h:null,catalogVersion:splitCatalog.version,
            indoorUnits:[{id:crypto.randomUUID(),roomId:room.id,floorId:room.floorId,wallId:pose.wall.id,mounting:unit.mounting,position:pose.position,rotation:pose.rotation,widthMm:unit.widthMm,heightMm:unit.heightMm,depthMm:unit.depthMm,productId:unit.id,catalogVersion:splitCatalog.version,locked:false}],
            outdoorUnit:null,compatibilityStatus:'unverifiable',linearPlan:null,decisionOrigin:'manual'}];
          room.systemType='split';
        }
        selectionId=p.hvacSystems[0].indoorUnits[0].id;
      }else if(target.kind==='terminal'){
        const family=airTerminalCatalog.families.find(f=>f.familyCode===target.family);
        p.rooms[0].supplyPoints=1;p.rooms[0].returnPoints=1;
        const use=family.use[0];
        const solution=sizeAirTerminal(null,1,family,use)[0];
        if(!solution)throw new Error('Fixture senza punto '+target.family);
        p=applyAirTerminalSolution(p,p.rooms[0].id,null,use,family.familyCode,solution,'ceiling');
        selectionId=p.airTerminals[0].id;
      }else if(target.kind==='fanCoil'){
        const product=fanCoilCatalog.products.find(p=>p.family===target.family);
        p=applyFanCoil(p,p.rooms[0].id,product.id);
        selectionId=p.fanCoils[0].id;
      }else if(target.kind==='heatPump'){
        const product=heatPumpCatalog.products.find(p=>p.family===target.family);
        p=applyHydronicSystem(p,{productId:product.id,roomIds:[p.rooms[0].id],fanCoilIds:[],operatingPointIndex:0});
        selectionId=p.hydronicSystems[0].outdoorUnit.id;
      }else{
        p=applyDuctedSystem(p,[p.rooms[0].id],'Mitsubishi Electric',null);
        p=placeMachineOnPlan(p,p.hvacSystems[0].id,p.rooms[0].id,{x:1.5,y:1.5});
        selectionId=p.hvacSystems[0].indoorUnits[0].id;
      }
      console.log(JSON.stringify({project:projectSchema.parse(ensureInstallations(p)),selectionId}));
    `,
        ],
        { encoding: "utf8" },
      ),
    );
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "model.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await openDisclosure(page, "Modifica");
    await page
      .getByLabel("Elemento nel progetto", { exact: true })
      .selectOption(selectionId);
    // Import validates legacy bindings; the 3D view must preserve the resulting stored project.
    const before = await exportPlenumFixture(page);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const viewer = page.getByTestId("viewer-3d"),
      canvas = viewer.locator("canvas");
    await expect(canvas).toHaveAttribute("data-rendered", "true");
    await expect(canvas).toHaveAttribute("data-selection", selectionId);
    await openDisclosure(viewer, "Vista 3D");
    await viewer
      .getByRole("button", { name: "Avvicina selezione", exact: true })
      .click();
    await viewer
      .locator("summary")
      .filter({ hasText: "Vista 3D" })
      .first()
      .click();
    await page.screenshot({ path: info.outputPath("reconstruction.png") });
    const saved = await exportPlenumFixture(page);
    for (const key of [
      "radiators",
      "hvacSystems",
      "airTerminals",
      "fanCoils",
      "hydronicSystems",
    ] as const)
      expect(saved[key] ?? []).toEqual(before[key] ?? []);
  });
