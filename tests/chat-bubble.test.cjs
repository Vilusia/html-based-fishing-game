const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');const source=fs.readFileSync(path.join(__dirname,'../ui.js'),'utf8'),start=source.indexOf('function wrapChatBubbleText('),end=source.indexOf('function showChatBubble(',start),c=vm.createContext({Intl});vm.runInContext(source.slice(start,end),c);
const measure=text=>Array.from(text).reduce((sum,char)=>sum+(/[WM]/.test(char)?23:/[il]/.test(char)?5:char===' '?6:12),0);
test('wide letters and long words wrap to the actual available pixels',()=>{
 for(const text of ['WWWWWWWWWWWWWWWWWWWWWWWW','MMMM hello WWWWW goodbye MMMM','https://example.com/averylongsinglewordwithoutspaces','A normal message that should wrap across several readable lines']){
  const lines=c.wrapChatBubbleText(text,measure,216);assert(lines.length>0);for(const line of lines)assert(measure(line)<=216,line+' fits');assert.equal(lines.join('').replace(/ /g,''),text.replace(/ /g,''),'no beginning or ending characters are lost');
 }
});
test('explicit lines and emoji sequences are preserved',()=>{
 const lines=c.wrapChatBubbleText('Hello\n\nGoodbye',measure,216);assert.deepEqual(Array.from(lines),['Hello','','Goodbye']);
 const emoji='👩‍🚀';const wrapped=c.wrapChatBubbleText(emoji.repeat(8),()=>0,216);assert.equal(wrapped[0],emoji.repeat(8));
 const parts=c.wrapChatBubbleText(emoji.repeat(8),str=>Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(str)).length*60,120);assert(parts.every(line=>line===emoji.repeat(2)));
});
