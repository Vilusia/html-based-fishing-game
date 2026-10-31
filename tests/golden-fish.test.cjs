const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({THREE:require('../vendor/three.min.js'),window:{},Math,player:{position:{x:0,z:0}},isRaining:false,saveState:{},worldTime:12});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../fish.js'),'utf8'),context);
const source=fs.readFileSync(path.join(__dirname,'../ui.js'),'utf8');vm.runInContext(source.slice(source.indexOf('function selectFish()'),source.indexOf('\nfunction updateJournal(',source.indexOf('function selectFish()'))),context);
test('four golden variants use real roster species, gold colors, and exact rare roll boundaries',()=>{
    const fish=vm.runInContext('GOLDEN_FISH',context);assert.equal(fish.length,4);
    for(let i=0;i<4;i++){const entry=fish[i];context.species=entry.species;assert(vm.runInContext('FISH_TYPES.some(f=>f.name===species&&!f.golden)',context));context.roll=(i+.5)/10000;assert.equal(vm.runInContext('rollGoldenFish(roll).name',context),entry.name);assert(entry.color.startsWith('#'));assert.equal(entry.chance,0);context.name=entry.name;assert(vm.runInContext('getFishByName(name).golden',context));}
    for(const value of [-1,.0004,.5,NaN,Infinity]){context.roll=value;assert.equal(vm.runInContext('rollGoldenFish(roll)',context),null);}
});
test('golden fish override all zone, weather and special-pool branches and retain tier/size handling',()=>{
    context.Math=Object.create(Math);context.Math.random=()=>.00005;
    for(const zone of ['lake','pond','ocean','lava','void','secret'])for(const raining of [false,true]){
        context.testZone=zone;context.isRaining=raining;vm.runInContext("player={position:{x:0,z:0}};fishingZone=testZone;fishingZoneCategory='';activeBaitId=BAIT_TYPES[0].id",context);
        const result=vm.runInContext('selectFish()',context);assert.equal(result.name,'Golden Common Carp',zone);assert.equal(result.rarity,'Legendary');assert.equal(result.color,'#efbf3f');assert(result.tierId);assert(Number.isFinite(result.price));
    }
});
