// Passive rendered-frame telemetry. Never schedules, skips, delays or caps a frame.
(function () {
    let started=null,frames=0,work=0,frameStart=0,node=null,builds=0,lastDom=0;
    const mainRender={render:{calls:0,triangles:0}};
    const state={fps:0,frameMs:0,workMs:0,draws:0,triangles:0,builds:0};
    function beginFrame(now){if(started===null)started=now;frameStart=now;}
    function finishFrame(now,info,visible=true){
        frames++;work+=Math.max(0,now-frameStart);
        if(now-started<500)return;
        const elapsed=now-started;
        state.fps=Math.round(frames*1000/elapsed);state.frameMs=elapsed/frames;state.workMs=work/frames;state.builds=builds;
        info=info||mainRender;state.draws=info.render?info.render.calls:0;state.triangles=info.render?info.render.triangles:0;
        if(typeof document!=='undefined'){
            node=node||document.getElementById('performance-counter');
            if(node){
                if(node.hidden===visible)node.hidden=!visible;
                // The overlay is fixed and size-contained. Updating its text is
                // still a layout/paint burst; doing it twice a second could
                // shave a frame each time. Write at most once a second.
                if(visible&&now-lastDom>=1000){
                    node.textContent=state.fps+' FPS · '+state.frameMs.toFixed(1)+' ms/frame\nWork '+state.workMs.toFixed(1)+' ms · '+state.draws+' draws · '+state.triangles.toLocaleString()+' tris\nModel builds: '+builds;
                    lastDom=now;
                }
            }
        }
        frames=0;work=0;started=now;
    }
    function captureRender(info){mainRender.render.calls=info.render.calls;mainRender.render.triangles=info.render.triangles;}
    function recordModelBuild(){builds++;}
    window.GamePerformance={beginFrame,finishFrame,captureRender,recordModelBuild,state};
})();
