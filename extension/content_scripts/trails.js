/* Canvas overlay for the gesture trail — replaces OGC_Trails.js. */
(function () {
  let canvas, ctx;
  function ensure() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.id = "ogc-trail-canvas";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.documentElement.appendChild(canvas);
    ctx = canvas.getContext("2d");
    window.addEventListener("resize", () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });
  }
  window.OGC_Trails = {
    start(x, y) {
      ensure();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#ff7900"; // Orange brand
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      canvas.style.display = "block";
    },
    lineTo(x, y) { if (ctx) { ctx.lineTo(x, y); ctx.stroke(); } },
    end() {
      if (!canvas) return;
      setTimeout(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = "none";
      }, 250);
    }
  };
})();