const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('YouTube uses a full-HD internal viewport while keeping the existing shell size and playback behavior',()=>{
    const source=fs.readFileSync(path.join(__dirname,'../props.js'),'utf8');let config,plays=0,mutes=0,seek=null;const iframe={style:{}};
    const context=vm.createContext({YT:{Player:class{constructor(element,options){config=options;}}},Date:{now:()=>10000},setTimeout(){},console});
    vm.runInContext(source.slice(source.indexOf('function createYtPlayer(entry)'),source.indexOf('function startYtSyncLoop(')),context);
    context.entry={frameEl:{isConnected:true},data:{videoId:'M7lc1UVf-VE',startedAt:0}};vm.runInContext('createYtPlayer(entry)',context);
    assert.equal(config.width,'1920');assert.equal(config.height,'1080');
    config.events.onReady({target:{getIframe:()=>iframe,mute(){mutes++;},getDuration:()=>100,seekTo:value=>{seek=value;},playVideo(){plays++;}}});
    assert.equal(iframe.style.width,'1920px');assert.equal(iframe.style.height,'1080px');assert.equal(iframe.style.transform,'scale(0.3333333333)');assert.equal(plays,1);assert.equal(mutes,1);assert.equal(seek,10);
});
