(() => {
  class DanmakuLifecycle {
    constructor(){this.stopped=false;this.timers=[];this.cleanups=[];}
    stop(){
      if(this.stopped)return;
      this.stopped=true;
      this.timers.forEach(id=>clearInterval(id));
      this.cleanups.forEach(fn=>{try{fn();}catch{}});
      this.timers=[];this.cleanups=[];
    }
    failed(error){
      if(/extension context invalidated|context has been invalidated/i.test(String(error?.message || error)))this.stop();
    }
    onStop(fn){if(this.stopped){try{fn();}catch{}}else this.cleanups.push(fn);}
    async call(fn,fallback={}){
      if(this.stopped)return fallback;
      try{return await fn();}catch(error){this.failed(error);return fallback;}
    }
    every(fn,delay){
      if(this.stopped)return null;
      const id=setInterval(()=>{
        if(this.stopped)return;
        try{
          if(!chrome.runtime.id){this.stop();return;}
          Promise.resolve(fn()).catch(e=>this.failed(e));
        }catch(error){this.failed(error);}
      },delay);
      this.timers.push(id);return id;
    }
  }
  globalThis.DanmakuLifecycle=DanmakuLifecycle;
})();
