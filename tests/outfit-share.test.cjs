const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=fs.readFileSync('core.js','utf8'),ui=fs.readFileSync('ui.js','utf8');
function bodyPaintRules(){
 const start=core.indexOf('// Body paint is a compact'),end=core.indexOf('const DEFAULT_SAVE_STATE',start),c=vm.createContext({window:{}});
 vm.runInContext(core.slice(start,end),c);return c.window.BodyPaint;
}
const BP=bodyPaintRules(),blank='.'.repeat(BP.size);
function shareContext(){
 const start=ui.indexOf('    const OUTFIT_SHARE_PREFIX'),end=ui.indexOf('    window.renderOutfitList =',start);
 const c=vm.createContext({window:{},TextEncoder,TextDecoder,btoa,atob,normalizeBodyPaint:BP.normalize,normalizeBodyPaintColor:BP.normalizeColor});
 c.globalThis=c;c.window.ProtogenLogo={normalize:value=>value==='saved-sign'?'saved-sign':''};
 vm.runInContext(ui.slice(start,end),c);return c;
}
test('outfit share codes round-trip paints, colors and head fields through a bounded allowlist',()=>{
 const c=shareContext(),paint=blank.slice(0,4)+'a'+blank.slice(5),head=blank.slice(0,8)+'x'+blank.slice(9);
 const outfit={name:'Shared look',ears:'fox',eyes:'dragon',nose:'dog',misc:'fox_cheeks',tail:'fox',hat:'cap',shirt:'stripes',pants:'denim',collar:'bell',rod:'oak',title:'novice',hair:'bob',color:'#AABBCC',belly:'#FFFFFF',eye:'#000000',earsColor:'#123456',noseColor:'',miscColor:'',tailColor:'#654321',handColor:'',footColor:'',tailAccentColor:'',hairColor:'#abcdef',bodyPaint:paint,bodyPaintBack:paint,bodyPaintLeft:paint,bodyPaintRight:paint,bodyPaintHeadFront:head,bodyPaintHeadBack:head,bodyPaintHeadLeft:head,bodyPaintHeadRight:head,bodyPaintHeadTop:head,bodyPaintHeadBottom:head,bodyPaintArmLeft:paint,bodyPaintArmRight:paint,bodyPaintLegLeft:paint,bodyPaintLegRight:paint,bodyPaintColor:'#12AB34',protogenLogo:'saved-sign'};
 const code=c.window.encodeOutfitShare(outfit);assert(code.startsWith('HF1-'));assert(code.length>5000&&code.length<24000);
 const decoded=c.window.decodeOutfitShare(code);
 assert.equal(decoded.name,'Shared look');assert.equal(decoded.ears,'fox');assert.equal(decoded.hat,'cap');assert.equal(decoded.color,'#aabbcc');assert.equal(decoded.belly,'#ffffff');assert.equal(decoded.bodyPaint,paint);assert.equal(decoded.bodyPaintHeadFront,head);assert.equal(decoded.bodyPaintHeadRight,head);assert.equal(decoded.bodyPaintHeadTop,head);assert.equal(decoded.bodyPaintHeadBottom,head);assert.equal(decoded.bodyPaintArmLeft,paint);assert.equal(decoded.bodyPaintLegRight,paint);assert.equal(decoded.bodyPaintColor,'#12ab34');assert.equal(decoded.protogenLogo,'saved-sign');assert(!Object.hasOwn(decoded,'__proto__'));
});
test('malformed or unknown outfit codes are rejected and shared values are normalized',()=>{
 const c=shareContext();
 for(const bad of [null,'','HF1-','HF1-not-base64','HF1-'+Buffer.from('not json').toString('base64url'),'HF2-'+Buffer.from('{}').toString('base64url')])assert.throws(()=>c.window.decodeOutfitShare(bad));
 const dirty={name:'x'.repeat(40),ears:{bad:true},hat:'</script>',color:'red',belly:'blue',eye:'#123',bodyPaint:'bad',bodyPaintHeadFront:'g'.repeat(552),bodyPaintColor:'not-a-color',protogenLogo:'https://example.com/a.png',extra:'ignored'};
 const clean=c.window.decodeOutfitShare(c.window.encodeOutfitShare(dirty));
 assert.equal(clean.name,'xxxxxxxxxxxx');assert.equal(clean.ears,'none');assert.equal(clean.hat,'</script>');assert.equal(clean.color,'#ff0000');assert.equal(clean.belly,'#ffffff');assert.equal(clean.eye,'#000000');assert.equal(clean.bodyPaint,'');assert.equal(clean.bodyPaintHeadFront,'');assert.equal(clean.bodyPaintColor,'#ffffff');assert.equal(clean.protogenLogo,'');assert(!Object.hasOwn(clean,'extra'));
});
test('shop and studio expose share and import controls for saved outfits',()=>{
 const html=fs.readFileSync('index.html','utf8'),studio=fs.readFileSync('character-studio.js','utf8');
 assert(html.includes('onclick="importOutfitCode()"'));
 assert(ui.includes("window.shareOutfit=function shareOutfit(id)"));
 assert(ui.includes("btnShare.innerText = 'Share'"));
 assert(ui.includes("window.importOutfitCode=function importOutfitCode()"));
 assert(studio.includes("button('Share',()=>window.shareOutfit?.(look.id)"));
 assert(studio.includes('Import outfit code'));
 for(const key of ['bodyPaintHeadFront','bodyPaintHeadBack','bodyPaintHeadLeft','bodyPaintHeadRight','bodyPaintHeadTop','bodyPaintHeadBottom'])assert(ui.includes(key));
});
