(() => {
  function isUrl(value){
    try{const u=new URL(value);return u.protocol==='https:' && ['www.youtube.com','m.youtube.com'].includes(u.hostname) && !u.username && !u.password && !u.port;}catch{return false;}
  }
  // Mobile YouTube may replace or relocate the video without a full navigation.
  function player(doc){
    const desktop=doc.querySelector('#movie_player');
    const desktopVideo=desktop?.querySelector('video');
    if(desktopVideo){const fullscreen=doc.fullscreenElement;return fullscreen && fullscreen!==desktopVideo && fullscreen.contains(desktopVideo)?fullscreen:desktop;}
    for(const selector of ['#player-container-id','#player','ytm-player']){
      const container=doc.querySelector(selector),video=container?.querySelector('video');
      if(!video)continue;
      const fullscreen=doc.fullscreenElement;
      if(fullscreen && fullscreen!==video && fullscreen.contains(video))return fullscreen;
      return video.closest('.html5-video-player') || video.parentElement || container;
    }
    return null;
  }
  globalThis.DanmakuYouTube={isUrl,player};
})();
