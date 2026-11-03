// Geometry is retained per message, so changing settings cannot invalidate live lanes.
(() => {
  class DanmakuLayout {
    constructor(){this.active=[];}
    clear(){this.active=[];}
    place({now,width,height,messageWidth,messageHeight,duration}){
      this.active=this.active.filter(x=>x.end>now);
      const gap=16, verticalGap=4;
      const speed=(width+messageWidth)/duration;
      const maxTop=height-messageHeight-8;
      if(maxTop<8)return null;
      // Top-first packing: reuse the highest safe lane before opening a lower one.
      // Real occupied boundaries avoid empty rows when old and new font sizes differ.
      const candidates=[...new Set([8,...this.active.flatMap(x=>[x.top,x.top+x.height+verticalGap])])]
        .filter(y=>y>=8 && y<=maxTop).sort((a,b)=>a-b);
      for(const top of candidates){
        const blocked=this.active.some(x=>{
          if(top+messageHeight+verticalGap<=x.top || x.top+x.height+verticalGap<=top)return false;
          const right=x.startWidth-x.speed*(now-x.start)+x.width;
          if(right<=0)return false;
          const initialGap=width-right;
          // Check both ends of the remaining overlap interval, including catch-up.
          const overlap=Math.min(right/x.speed,duration);
          return initialGap<gap || initialGap+(x.speed-speed)*overlap<gap;
        });
        if(blocked)continue;
        const item={top,height:messageHeight,width:messageWidth,startWidth:width,speed,start:now,end:now+duration};
        this.active.push(item);
        return item;
      }
      return null;
    }
  }
  globalThis.DanmakuLayout=DanmakuLayout;
})();
