  /* ================================================================== */
  /*  Тосты и стили                                                      */
  /* ================================================================== */
  let toastBox = null;
  function toast(msg, kind = '') {
    const hd = hostDoc();
    if (!hd.body) return;
    if (!toastBox || !toastBox.isConnected || toastBox.ownerDocument !== hd) { toastBox = h('div', { class: 'vxp-toasts' }); hd.body.append(toastBox); }
    const t = h('div', { class: 'vxp-toast ' + kind }, msg);
    toastBox.append(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3000);
  }
  VXP.toast = toast;

  const CSS = `
.vxp-panel,.vxp-studio,.vxp-toasts,.vxp-count,.vxp-fxs{--vtr:#2b2b33;--vtr2:#1d1d23;--vh:#272730;--vcv:#07070a;--vcard:#0c0c10;--vp0:#131318;--vp1:#0b0b0e;--vov:rgba(3,3,5,.82);--va3:255,90,0;--vb:#0b0b0e;--v1:#121216;--v2:#18181d;--v3:#202026;--vl:rgba(255,255,255,.08);--vl2:rgba(255,255,255,.15);--vt:#f4f4f7;--vd:rgba(244,244,247,.58);--va:#ff5a00;--va2:#ff8a3d;--vok:#2ee59d;--vw:#ffb020;--vr:#ff4d5e;--vo:#9aa6b8}
.vxp-panel{display:grid;gap:10px;padding:12px;border:1px solid var(--vl);border-radius:14px;background:radial-gradient(120% 70% at 0 0,rgba(var(--va3),.08),transparent 55%),linear-gradient(180deg,var(--vp0),var(--vp1));color:var(--vt);font-family:inherit;min-width:0;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.vxp-brand{display:flex;align-items:center;gap:8px;min-width:0;padding:2px 2px 4px}
.vxp-logo{width:22px;height:22px;flex:none;background:var(--va);-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2l8.66 5v10L12 22l-8.66-5V7z' fill='none' stroke='%23000' stroke-width='2' stroke-linejoin='round'/%3E%3Cpath d='M9.5 8.5h5M10.5 8.5v3.8L8.4 16.5h7.2l-2.1-4.2V8.5' fill='none' stroke='%23000' stroke-width='1.6' stroke-linejoin='round' stroke-linecap='round'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2l8.66 5v10L12 22l-8.66-5V7z' fill='none' stroke='%23000' stroke-width='2' stroke-linejoin='round'/%3E%3Cpath d='M9.5 8.5h5M10.5 8.5v3.8L8.4 16.5h7.2l-2.1-4.2V8.5' fill='none' stroke='%23000' stroke-width='1.6' stroke-linejoin='round' stroke-linecap='round'/%3E%3C/svg%3E") center/contain no-repeat;filter:drop-shadow(0 0 6px rgba(var(--va3),.55))}
.vxp-brand b,.vxp-brand i{font-size:13px;font-weight:950;letter-spacing:.07em;font-style:normal;white-space:nowrap}
.vxp-brand i{color:var(--va)}
.vxp-ver{margin-left:auto;font-size:10px;font-weight:900;color:var(--vd);border:1px solid var(--vl2);border-radius:999px;padding:1px 8px;white-space:nowrap}
.vxp-brand.sm .vxp-logo{width:16px;height:16px}.vxp-brand.sm b,.vxp-brand.sm i{font-size:11px}
.vxp-sec{display:grid;gap:8px;min-width:0;padding:10px;border:1px solid var(--vl);border-radius:11px;background:var(--v1)}
.vxp-sec+.vxp-sec{padding-top:10px;border-top:1px solid var(--vl)}
.vxp-title{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px;font-weight:950;letter-spacing:.09em;text-transform:uppercase;color:var(--vd);cursor:pointer;user-select:none}
.vxp-title>span:first-child::before{content:"";display:inline-block;width:6px;height:6px;border-radius:2px;background:var(--va);margin-right:8px;box-shadow:0 0 8px var(--va);vertical-align:1px}
.vxp-title .vxp-caret{color:var(--vd);font-size:10px;transition:transform .15s}
.vxp-sec.collapsed .vxp-caret{transform:rotate(-90deg)}
.vxp-sec.collapsed>:not(.vxp-title){display:none!important}
.vxp-badge{font-size:9px;font-weight:900;color:#1a0a00;background:var(--va);border-radius:999px;padding:1px 7px;letter-spacing:.04em}
.vxp-badge.warn{background:var(--vw)}
.vxp-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-width:0}
.vxp-btn{height:32px;min-height:0;min-width:0;padding:0 12px;border-radius:9px;border:1px solid var(--vl2);background:var(--v3);color:var(--vt);font-weight:800;font-size:12px;line-height:1;font-family:inherit;box-shadow:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;transition:border-color .12s,background .12s,transform .06s,box-shadow .12s}
.vxp-btn:hover:not([disabled]){border-color:var(--va);background:var(--vh)}
.vxp-btn:active:not([disabled]){transform:translateY(1px)}
.vxp-btn.icon{width:32px;padding:0}
.vxp-btn.primary{background:linear-gradient(180deg,var(--va2),var(--va));color:#1a0a00;border-color:transparent;box-shadow:0 4px 14px rgba(var(--va3),.28)}
.vxp-btn.primary:hover:not([disabled]){background:linear-gradient(180deg,#ffa05c,#ff6a14)}
.vxp-btn.rec{background:linear-gradient(180deg,#ff6b78,#d9283a);border-color:transparent;color:#fff;box-shadow:0 4px 14px rgba(255,77,94,.28)}
.vxp-btn.wide{flex:1 1 auto}
.vxp-btn.small{height:26px;padding:0 9px;font-size:11px}
.vxp-btn[disabled]{opacity:.42;cursor:default}
.vxp-editor{display:grid;gap:6px;min-width:0}
canvas.vxp-tracks{width:100%;height:112px;display:block;border-radius:9px;background:#07070a;border:1px solid var(--vl);cursor:grab;touch-action:none}
canvas.vxp-tracks.dragging{cursor:grabbing}
canvas.vxp-tracks.big{height:160px}
.vxp-editbar{display:grid;gap:6px}
.vxp-tools{justify-content:space-between;gap:4px}
.vxp-btn.active{border-color:var(--va);background:rgba(var(--va3),.14);color:var(--va2)}
canvas.vxp-tracks.cut{cursor:crosshair}
canvas.vxp-tracks:focus{outline:1px solid rgba(var(--va3),.5);outline-offset:1px}
.vxp-fxflags{display:flex;flex-wrap:wrap;gap:6px 14px}
.vxp-offset{min-width:62px;text-align:center;font-size:12px;font-weight:900;color:var(--va2);font-variant-numeric:tabular-nums}
.vxp-slider{display:grid;grid-template-columns:minmax(0,96px) 1fr 52px;gap:8px;align-items:center;font-size:12px;font-weight:800}
.vxp-slider>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vxp-slider input{width:100%;min-width:0;min-height:0;height:18px;margin:0}
.vxp-slider input[type=range]{-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer}
.vxp-slider input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(90deg,var(--va) var(--p,50%),var(--vtr) var(--p,50%))}
.vxp-slider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;margin-top:-5px;border-radius:50%;background:#fff;border:2px solid var(--va);box-shadow:0 0 0 3px rgba(var(--va3),.16)}
.vxp-slider input[type=range]::-moz-range-track{height:4px;border-radius:2px;background:var(--vtr)}
.vxp-slider input[type=range]::-moz-range-progress{height:4px;border-radius:2px;background:var(--va)}
.vxp-slider input[type=range]::-moz-range-thumb{width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid var(--va)}
.vxp-slider output{text-align:right;font-variant-numeric:tabular-nums;color:var(--va2);font-weight:900;white-space:nowrap}
.vxp-meter{height:6px;border-radius:3px;background:var(--vtr2);overflow:hidden;position:relative}
.vxp-meter>i{position:absolute;inset:0 auto 0 0;width:0;background:linear-gradient(90deg,var(--vok) 0%,var(--vok) 60%,var(--vw) 82%,var(--vr) 100%);background-size:var(--w,258px) 100%;transition:width .06s linear}
.vxp-meter.idle>i{width:0!important}
.vxp-check{display:flex;gap:9px;align-items:center;font-size:12px;font-weight:750;cursor:pointer;line-height:1.2}
.vxp-check input{-webkit-appearance:none;appearance:none;width:30px;height:17px;min-height:0;margin:0;flex:none;border-radius:999px;background:var(--vtr);border:0;position:relative;cursor:pointer;transition:background .15s}
.vxp-check input::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#fff;transition:transform .15s}
.vxp-check input:checked{background:var(--va)}
.vxp-check input:checked::after{transform:translateX(13px)}
.vxp-check.disabled{opacity:.45;cursor:default}
.vxp-select{height:28px;min-height:0;padding:0 8px;border-radius:8px;border:1px solid var(--vl2);background:var(--v3);color:var(--vt);font:inherit;font-size:12px;font-weight:800}
.vxp-inline{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:750}
.vxp-hint{font-size:11px;color:var(--vd);line-height:1.4}
.vxp-hint.warn{color:var(--vw)}
.vxp-themes{display:flex;flex-wrap:wrap;gap:8px}
.vxp-sw{width:26px;height:26px;min-height:0;padding:0;border-radius:50%;border:2px solid transparent;cursor:pointer;box-shadow:0 0 0 1px var(--vl2);transition:transform .1s}
.vxp-sw:hover{transform:scale(1.12)}
.vxp-sw.on{border-color:var(--vt);box-shadow:0 0 0 2px var(--va)}
.vxp-fxs{position:fixed;inset:0;z-index:2147483640;background:rgba(3,3,5,.84);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Nunito Variable","Arial Rounded MT Bold",system-ui,sans-serif;color:var(--vt)}
.vxp-fxcard{width:min(1040px,100%);max-height:calc(100vh - 32px);overflow:auto;display:grid;gap:12px;padding:16px;background:radial-gradient(90% 40% at 0 0,rgba(var(--va3),.1),transparent 60%),#0c0c10;border:1px solid var(--vl2);border-top:2px solid var(--va);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.7)}
.vxp-fxhead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.vxp-fxtitle{font-size:15px;font-weight:950;letter-spacing:.08em}
.vxp-eqwrap{border:1px solid var(--vl);border-radius:11px;overflow:hidden;background:#07070a}
canvas.vxp-eqcv{display:block;width:100%;height:300px;touch-action:none}
.vxp-bandrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.vxp-bchip{width:26px;height:26px;border-radius:50%;border:2px solid var(--bc);background:transparent;color:var(--bc);font:900 11px system-ui;cursor:pointer;padding:0;opacity:.6}
.vxp-bchip.on{background:var(--bc);color:#101014;opacity:1}.vxp-bchip.sel{box-shadow:0 0 0 2px #fff;opacity:1}
.vxp-nl{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:var(--vd)}
.vxp-num{width:74px;height:28px;border-radius:8px;border:1px solid var(--vl2);background:var(--v3);color:var(--vt);font:800 12px inherit;padding:0 6px}
.vxp-dcards{display:grid;grid-template-columns:1.6fr 1fr .8fr;gap:10px}
@media (max-width:900px){.vxp-dcards{grid-template-columns:1fr}}
.vxp-dcard{display:grid;gap:10px;padding:12px;border:1px solid var(--vl);border-radius:11px;background:var(--v1)}
.vxp-dhead{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.vxp-dhead b{font-size:12px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}.vxp-dhead small{display:block;color:var(--va2);font-size:9px;font-weight:900;letter-spacing:.1em}
.vxp-knobs{display:flex;flex-wrap:wrap;gap:10px 14px}
.vxp-knob{display:grid;justify-items:center;gap:2px;width:68px;user-select:none}
.vxp-knobcv{cursor:ns-resize;touch-action:none}
.vxp-kval{font-size:11px;font-weight:900;color:var(--va2);font-variant-numeric:tabular-nums;white-space:nowrap}
.vxp-klab{font-size:10px;font-weight:800;color:var(--vd);white-space:nowrap}
.vxp-gr{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;color:var(--vd)}
.vxp-gr>i{flex:1;height:7px;border-radius:4px;background:var(--vtr2);overflow:hidden;position:relative}
.vxp-gr>i>u{position:absolute;inset:0 0 0 auto;width:0;background:linear-gradient(270deg,var(--va),var(--va2));transition:width .05s}
.vxp-gr>span{min-width:58px;text-align:right;font-variant-numeric:tabular-nums;color:var(--va2)}
.vxp-diag{display:grid;gap:4px}
.vxp-diag>div{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:750}
.vxp-diag i{width:8px;height:8px;border-radius:50%;flex:none;background:var(--vw)}
.vxp-diag .ok i{background:var(--vok);box-shadow:0 0 6px var(--vok)}.vxp-diag .bad i{background:var(--vr);box-shadow:0 0 6px var(--vr)}
.vxp-diag .n{margin-left:auto;color:var(--vd);font-weight:600;text-align:right}
.vxp-nrstat{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;color:var(--vd)}
.vxp-nrstat>i{flex:1;height:5px;border-radius:3px;background:var(--vtr2);overflow:hidden;position:relative}
.vxp-nrstat>i>u{position:absolute;inset:0 auto 0 0;width:0;background:linear-gradient(90deg,var(--va),var(--va2));transition:width .12s}
.vxp-nrstat>span{min-width:110px;text-align:right;font-variant-numeric:tabular-nums}
.vxp-nrstat.on>span{color:var(--va2)}
.vxp-lines{display:grid;gap:4px;max-height:200px;overflow:auto;padding-right:2px}
.vxp-line{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:7px 9px;border-radius:8px;background:var(--v2);border:1px solid transparent;font-size:12px;cursor:pointer;min-width:0}
.vxp-line:hover{border-color:rgba(var(--va3),.45)}
.vxp-line.active{border-color:var(--va);background:rgba(var(--va3),.1)}
.vxp-line .n{font-weight:900;color:var(--vd);font-variant-numeric:tabular-nums}
.vxp-line .c{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.vxp-chip{font-size:9px;font-weight:950;padding:2px 7px;border-radius:999px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
.vxp-chip.sent{background:rgba(46,229,157,.14);color:var(--vok)}
.vxp-chip.ready{background:rgba(255,176,32,.15);color:var(--vw)}
.vxp-chip.now{background:rgba(var(--va3),.2);color:var(--va2)}
.vxp-chip.todo{background:rgba(255,255,255,.07);color:var(--vd)}
.vxp-chip.sending{background:rgba(124,156,255,.18);color:#9fb4ff}
.vxp-status{font-size:12px;font-weight:750;color:var(--vt);line-height:1.35}
.vxp-status b{color:var(--vt)}
.vxp-toasts{position:fixed;right:16px;bottom:16px;display:grid;gap:8px;z-index:2147483646;pointer-events:none}
.vxp-toast{background:var(--vcard);border:1px solid rgba(var(--va3),.5);border-left:3px solid var(--va);color:var(--vt);padding:10px 14px;border-radius:10px;font:800 13px/1.3 "Nunito Variable",system-ui,sans-serif;box-shadow:0 10px 34px rgba(0,0,0,.5);transition:opacity .3s,transform .3s;max-width:340px}
.vxp-toast.err{border-color:rgba(255,77,94,.6);border-left-color:var(--vr)}
.vxp-toast.out{opacity:0;transform:translateY(6px)}
.vxp-count{position:fixed;z-index:2147483500;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:rgba(0,0,0,.5);border-radius:10px;cursor:pointer;font-family:"Nunito Variable",system-ui,sans-serif;color:#fff}
.vxp-count.in{position:absolute;inset:0}
.vxp-count b{font-size:clamp(64px,14vw,150px);line-height:1;font-weight:950;text-shadow:0 0 38px rgba(var(--va3),.9);animation:vxpPop .95s ease-out both}
.vxp-count small{font-size:12px;font-weight:800;color:rgba(255,255,255,.78)}
@keyframes vxpPop{0%{transform:scale(1.45);opacity:0}18%{opacity:1}100%{transform:scale(.92);opacity:.9}}
.vxp-studio{position:fixed;inset:0;z-index:2147483600;background:var(--vov);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Nunito Variable","Arial Rounded MT Bold",system-ui,sans-serif;color:var(--vt)}
.vxp-card{align-items:start;width:min(1100px,100%);max-height:calc(100vh - 32px);overflow:auto;background:radial-gradient(90% 40% at 0 0,rgba(var(--va3),.08),transparent 60%),var(--vcard);border:1px solid var(--vl2);border-top:2px solid var(--va);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.65);display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:14px;padding:16px}
.vxp-card-head{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:10px}
.vxp-card-head h3{margin:2px 0 0;font-size:17px;font-weight:950}
.vxp-card-head small{display:block;color:var(--va2);font-size:11px;font-weight:950;letter-spacing:.07em;text-transform:uppercase;margin-top:6px}
.vxp-stagebox{display:grid;gap:10px;min-width:0;align-content:start}
.vxp-video{position:relative;border:1px solid rgba(var(--va3),.5);border-radius:10px;background:#000;aspect-ratio:16/9;overflow:hidden;box-shadow:0 0 0 3px rgba(var(--va3),.08)}
.vxp-video video{width:100%;height:100%;object-fit:contain;display:block}
.vxp-cue{position:absolute;left:10px;top:10px;padding:4px 11px;border-radius:999px;font-size:11px;font-weight:950;letter-spacing:.07em;background:rgba(0,0,0,.65);display:none;z-index:2}
.vxp-cue.on{display:block}.vxp-cue.ready{color:var(--vw)}.vxp-cue.rec{color:var(--vr)}.vxp-cue.tail{color:var(--vw)}
.vxp-sub{border-top:1px solid rgba(var(--va3),.4);padding:8px 2px 0}
.vxp-sub span{display:block;color:var(--va2);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.05em}
.vxp-sub p{margin:4px 0 0;font-size:17px;font-weight:900;line-height:1.3}
.vxp-side{display:grid;gap:10px;align-content:start;min-width:0}
.vxp-pst{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;font-family:"Nunito Variable","Arial Rounded MT Bold",system-ui,sans-serif}
.vxp-pst span{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);font-size:12px;font-weight:800;color:#e8e8ee;white-space:nowrap}
.vxp-pst span b{font-weight:900;color:var(--va,#ff8a3d)}
.vxp-pst span em{font-style:normal;opacity:.6;font-weight:700;font-size:11px}
.vxp-pst .g b{color:#2ee59d}.vxp-pst .w b{color:#ffb020}.vxp-pst .x b{color:#9aa6b8}
.vxp-pst.load span{opacity:.55}
.vxp-ifix{display:grid;gap:8px;padding:10px;border:1px solid var(--va,#ff5a00);border-radius:11px;background:var(--v1,#121216);min-width:0}
.vxp-steps{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.vxp-step{flex:1 1 0;min-width:96px;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--vl);border-radius:10px;background:var(--v1);color:var(--vd);font-size:12px;font-weight:800;transition:all .15s}
.vxp-step b{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--v3);color:var(--vt);font-size:12px;flex:none}
.vxp-step.now{border-color:var(--va);color:var(--vt);box-shadow:0 0 0 1px var(--va) inset,0 0 16px rgba(var(--va3),.25)}
.vxp-step.now b{background:var(--va);color:#fff}
.vxp-step.done{color:var(--vok);border-color:rgba(46,229,157,.35)}
.vxp-step.done b{background:var(--vok);color:#05110c}
.vxp-btn.big{padding:15px 18px;font-size:15px;font-weight:900;border-radius:13px;min-height:50px}
.vxp-btn.rec.live{animation:vxpPulse 1.1s ease-in-out infinite}
@keyframes vxpPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,77,94,.55)}50%{box-shadow:0 0 0 9px rgba(255,77,94,0)}}
.vxp-btn kbd{margin-left:8px;padding:1px 6px;border-radius:5px;background:rgba(255,255,255,.16);font:inherit;font-size:11px;font-weight:900;opacity:.85}
.vxp-navrow{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center}
.vxp-navrow .vxp-navmid{text-align:center;font-size:12px;font-weight:800;color:var(--vd)}
.vxp-help{display:grid;gap:4px;font-size:12px;color:var(--vd);line-height:1.5}
.vxp-help b{color:var(--vt)}
.vxp-side .vxp-lines{max-height:260px}
@media (max-width:860px){.vxp-card{grid-template-columns:1fr}.vxp-side .vxp-lines{max-height:160px}}
`;
  function injectCss() {
    if (qs('#vxp-style')) return;
    (document.head || document.documentElement).append(h('style', { id: 'vxp-style' }, CSS));
    applyTheme();
  }

  /* ================================================================== */
  /*  Общие виджеты: микрофон, обработка, отсчёт/буфер                   */
  /* ================================================================== */
  const widgets = new Set(); // элементы с ._sync()
  function syncWidgets() { for (const w of widgets) { if (!w.isConnected) { widgets.delete(w); continue; } try { w._sync(); } catch {} } }
  function slider({ label, min, max, step = 1, get, set, fmt, title, onCommit, def = 0 }) {
    const out = h('output');
    const range = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), title });
    const show = (v) => { out.textContent = fmt(v); range.style.setProperty('--p', clamp(((v - min) / (max - min)) * 100, 0, 100) + '%'); };
    range.addEventListener('input', () => { set(+range.value, false); show(+range.value); });
    range.addEventListener('change', () => { set(+range.value, true); onCommit && onCommit(+range.value); });
    range.addEventListener('dblclick', () => { range.value = String(def); set(def, true); show(def); onCommit && onCommit(def); });
    const el = h('label', { class: 'vxp-slider', title }, h('span', null, label), range, out);
    el._sync = () => { const v = get(); if (document.activeElement !== range) range.value = String(v); show(v); };
    el._sync(); widgets.add(el);
    return el;
  }
  function checkbox({ label, get, set, title }) {
    const cb = h('input', { type: 'checkbox' });
    cb.addEventListener('change', () => { set(cb.checked); syncWidgets(); });
    const el = h('label', { class: 'vxp-check', title }, cb, label);
    el._sync = () => { cb.checked = !!get(); };
    el._sync(); widgets.add(el);
    return el;
  }
  function selectRow({ label, options, get, set, title }) {
    const sel = h('select', { class: 'vxp-select', title }, options.map(([v, t]) => h('option', { value: String(v) }, t)));
    sel.addEventListener('change', () => { set(+sel.value); saveSettings(); syncWidgets(); });
    const el = h('label', { class: 'vxp-inline', title }, h('span', null, label), sel);
    el._sync = () => { sel.value = String(get()); };
    el._sync(); widgets.add(el);
    return el;
  }
  function micControls() {
    const meter = h('div', { class: 'vxp-meter idle', title: tr('Уровень микрофона (виден во время записи)', 'Mic level (shown while recording)') }, h('i'));
    meters.add(meter);
    return h('div', { style: 'display:grid;gap:7px' },
      slider({ label: tr('🎙 Микрофон', '🎙 Microphone'), min: -12, max: 12, get: () => settings.gainDb, set: (v) => { settings.gainDb = v; applyGainAll(); saveSettings(); }, fmt: (v) => fmtSigned(v, tr('дБ', 'dB')) || tr('0 дБ', '0 dB'), title: tr('Усиление микрофона — действует сразу, даже во время записи. Двойной клик — сброс', 'Mic gain — applies instantly, even while recording. Double-click — reset') }),
      meter,
      checkbox({ label: tr('Слушать себя при записи', 'Hear myself while recording'), get: () => settings.monitorSelf, set: (v) => { settings.monitorSelf = v; saveSettings(); updateMonitorAll(); }, title: tr('Свой голос в наушниках во время записи', 'Your own voice in headphones while recording') }),
    );
  }
  function timingControls() {
    return h('div', { style: 'display:grid;gap:6px' },
      selectRow({ label: tr('Отсчёт перед записью', 'Countdown before recording'), options: [[0, tr('нет', 'none')], [3, tr('3 с', '3 s')], [5, tr('5 с', '5 s')]], get: () => settings.countdown, set: (v) => { settings.countdown = v; }, title: tr('Обратный отсчёт 3-2-1 после нажатия «Записать»', '3-2-1 countdown after you press Record') }),
      selectRow({ label: tr('Буфер после реплики', 'Buffer after the line'), options: [[0, tr('нет', 'none')], [3, tr('3 с', '3 s')], [5, tr('5 с', '5 s')], [8, tr('8 с', '8 s')]], get: () => settings.tailSec, set: (v) => { settings.tailSec = v; }, title: tr('Запись продолжается после конца реплики — опоздавшую фразу можно перетащить влево', 'Recording continues after the line ends — drag a late phrase to the left') }),
      checkbox({ label: tr('Звук отсчёта', 'Countdown beeps'), get: () => settings.countBeep, set: (v) => { settings.countBeep = v; saveSettings(); } }),
    );
  }
  /** Прослушать дубль без шумодава / с ним (для сравнения). */
  function abPlay(target, withFx) {
    const t = target(); if (!t) return toast(tr('Нет записи', 'No take'), 'err');
    if (player.playing) return player.stop();
    const m = t.model, p = { ...m.params };
    if (withFx && !p.denoise) return toast(tr('Сначала поднимите «Шумодав» выше 0', 'Raise “Denoise” above 0 first'), 'err');
    if (!withFx) p.denoise = 0;
    const x = renderModel(Object.assign({}, m, { params: p, _rk: null, _r: null }));
    player.play({ tracks: [{ samples: x, sr: m.sr, startSec: 0, gain: 1 }], dur: x.length / m.sr + 0.1 });
  }
  /** Прослушать дорожку с подменой параметров (для модулей: «с эффектом» / «без»). */
  function abPatch(target, patch) {
    const t = target(); if (!t) return toast(tr('Нет записи', 'No take'), 'err');
    if (player.playing) return player.stop();
    const m = t.model, p = Object.assign({}, m.params, patch);
    const x = renderModel(Object.assign({}, m, { params: p, _rk: null, _r: null }));
    player.play({ tracks: [{ samples: x, sr: m.sr, startSec: 0, gain: 1 }], dur: x.length / m.sr + 0.1 });
  }
  /** Выбор «движка» шумодава: обычный или нейросеть (если подключён vxp-denoise.js). */
  function nnMode(commit) {
    const opts = [['', tr('Обычный', 'Classic')], ['gtcrn', tr('Нейросеть · сильная', 'Neural · strong')], ['rnnoise', tr('Нейросеть · лёгкая', 'Neural · light')]];
    const sel = h('select', { class: 'vxp-select', title: tr('Классический шумодав хорош против ровного шума. Нейросети отличают голос от шума по звуку: сильная лучше против клавиатуры, мышки и посторонних голосов, лёгкая быстрее', 'Classic suits steady noise. Neural nets tell voice from noise by sound: strong handles keyboard, mouse and other voices, light is faster') }, opts.map(([v, t]) => h('option', { value: v }, t)));
    sel.addEventListener('change', () => {
      settings.fx.nn = sel.value; saveSettings();
      if (sel.value && !nnReady(sel.value)) {
        if (VXP.nn) { toast(tr('Нейросеть ещё загружается, пока работает обычный шумодав. Повторите через несколько секунд', 'The neural net is still loading, classic denoise is used meanwhile. Try again in a few seconds'), 'warn'); VXP.nn.load(sel.value).then(() => { if (settings.fx.nn === sel.value) commit(); }); }
        else toast(tr('Модуль нейросети (vxp-denoise.js) не подключён', 'The neural module (vxp-denoise.js) is not installed'), 'err');
      }
      commit();
    });
    const el = h('label', { class: 'vxp-inline', title: sel.title }, h('span', null, tr('Режим шумодава', 'Denoise mode')), sel);
    el._sync = () => { sel.value = settings.fx.nn || ''; };
    el._sync(); widgets.add(el);
    return el;
  }
  const fmtSemi = (v) => (v ? fmtSigned(v, tr('пт', 'st')) : '0');
  /** Обработка: target() → {model, apply()} | null */
  function fxControls(target) {
    let timer = 0;
    const commit = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const t = target(); if (!t) return;
        for (const k of FX_KEYS) t.model.params[k] = cloneJ(settings.fx[k]);
        t.apply();
      }, 60);
    };
    const set = (k) => (v, done) => { settings.fx[k] = v; if (done) { saveSettings(); commit(); } };
    const flag = (k, label, title) => checkbox({ label, get: () => settings.fx[k], set: (v) => { settings.fx[k] = v; saveSettings(); commit(); }, title });
    const fxBtn = h('button', { class: 'vxp-btn primary wide', type: 'button', title: tr('Эквалайзер со спектром, компрессор, дэ-эссер и лимитер для вашей дорожки', 'Spectrum EQ, compressor, de-esser and limiter for your track'), onclick: () => openFxStudio(target, commit) }, '🎛 ORDAX FX · ' + tr('эквалайзер и динамика', 'EQ & dynamics'));
    const lowcut = flag('lowcut', tr('Срез низов', 'Low cut'), tr('Убирает гул и стук: фильтр высоких частот 90 Гц', 'Removes rumble and thumps: 90 Hz high-pass filter'));
    const spaceSet = (patch, done) => { settings.fx.space = Object.assign({}, settings.fx.space, patch); if (done) { saveSettings(); commit(); } };
    const typeBtns = [['room', tr('Комната', 'Room')], ['hall', tr('Зал', 'Hall')], ['echo', tr('Эхо', 'Echo')]].map(([t, l]) =>
      h('button', { class: 'vxp-btn small', type: 'button', 'data-t': t, title: { room: tr('Небольшое помещение — голос «живее»', 'A small room — a livelier voice'), hall: tr('Большой зал с длинным хвостом', 'A big hall with a long tail'), echo: tr('Повторы с затухающим тоном', 'Repeats that fade and darken') }[t], onclick: () => { spaceSet({ type: t }, true); if (!settings.fx.space.mix) spaceSet({ mix: 25 }, true); syncWidgets(); } }, l));
    const spaceBox = h('div', { style: 'display:grid;gap:7px' },
      h('div', { class: 'vxp-title', style: 'cursor:default' }, h('span', null, tr('Пространство', 'Space'))),
      h('div', { class: 'vxp-row' }, ...typeBtns),
      slider({ label: tr('🌌 Количество', '🌌 Amount'), min: 0, max: 100, step: 1, def: 0, get: () => settings.fx.space.mix, set: (v, d) => spaceSet({ mix: v }, d), fmt: (v) => (v ? v + '%' : tr('выкл', 'off')), title: tr('Сколько «пространства» добавить. Двойной клик — выключить', 'How much space to add. Double-click — off') }),
      slider({ label: tr('📐 Размер', '📐 Size'), min: 0, max: 100, step: 1, def: 50, get: () => settings.fx.space.size, set: (v, d) => spaceSet({ size: v }, d), fmt: (v) => v + '%', title: tr('Размер помещения / время между повторами', 'Room size / time between repeats') }));
    spaceBox._sync = () => { const sp = settings.fx.space; typeBtns.forEach((b) => b.classList.toggle('primary', b.dataset.t === sp.type && !!sp.mix)); };
    spaceBox._sync(); widgets.add(spaceBox);
    const extraHost = h('div', { style: 'display:grid;gap:7px' });
    extraHost._fill = () => { extraHost.textContent = ''; for (const e of VXP.fxExtras) { try { extraHost.appendChild(e.build({ commit, target, ab: (patch) => abPatch(target, patch) })); } catch (er) { console.warn('[Voxalike+OrdaxEd] fx extra', er); } } };
    extraHost._fill(); fxExtraHosts.add(extraHost);
    const reset = h('button', { class: 'vxp-btn small', type: 'button', onclick: () => { settings.fx = defFx(); saveSettings(); syncWidgets(); commit(); } }, tr('Сбросить', 'Reset'));
    return h('div', { style: 'display:grid;gap:7px' },
      slider({ label: tr('🔊 Громкость', '🔊 Volume'), min: -12, max: 12, get: () => settings.fx.gain, set: set('gain'), fmt: (v) => fmtSigned(v, tr('дБ', 'dB')) || tr('0 дБ', '0 dB'), title: tr('Громкость моей дорожки (с защитой от перегруза). Двойной клик — сброс', 'Volume of my track (overload-protected). Double-click — reset') }),
      slider({ label: tr('🎚 Питч', '🎚 Pitch'), min: -12, max: 12, step: 1, get: () => settings.fx.pitch, set: set('pitch'), fmt: fmtSemi, title: tr('Высота голоса в полутонах, длительность не меняется. Двойной клик — сброс', 'Voice pitch in semitones, duration unchanged. Double-click — reset') }),
      slider({ label: tr('⏩ Скорость', '⏩ Speed'), min: 0.5, max: 2, step: 0.05, def: 1, get: () => settings.fx.speed, set: set('speed'), fmt: (v) => '×' + (+v).toFixed(2), title: tr('Темп моей дорожки: быстрее — короче, медленнее — длиннее. Высота голоса не меняется. Двойной клик — сброс', 'Tempo of my track: faster — shorter, slower — longer. Pitch unchanged. Double-click — reset') }),
      slider({ label: tr('🧹 Шумодав', '🧹 Denoise'), min: 0, max: 100, step: 5, def: 0, get: () => settings.fx.denoise, set: set('denoise'), fmt: (v) => (v ? v + '%' : tr('выкл', 'off')), title: tr('Убирает постоянный фон с готовой записи: шипение, гул, вентилятор. Двойной клик — выключить', 'Removes steady background from the finished take: hiss, hum, fan. Double-click — off') }),
      nnMode(commit),
      h('div', { class: 'vxp-row' },
        h('button', { class: 'vxp-btn small', type: 'button', title: tr('Послушать мою дорожку без шумодава (повторный клик — стоп)', 'Listen to my track without denoise (click again to stop)'), onclick: () => abPlay(target, false) }, tr('▶ Без шумодава', '▶ No denoise')),
        h('button', { class: 'vxp-btn small', type: 'button', title: tr('Послушать мою дорожку с шумодавом', 'Listen to my track with denoise'), onclick: () => abPlay(target, true) }, tr('▶ С шумодавом', '▶ With denoise'))),
      h('div', { class: 'vxp-row' }, fxBtn),
      h('div', { class: 'vxp-fxflags' }, lowcut, flag('underwater', tr('Под водой', 'Underwater'), tr('Глухой «подводный» звук с лёгким плаванием', 'Muffled “underwater” sound with a slight wobble'))),
      spaceBox,
      extraHost,
      h('div', { class: 'vxp-inline', style: 'justify-content:flex-end' }, reset),
      h('div', { class: 'vxp-hint' }, tr('Обработка применяется к записи и сохраняется для следующих дублей.', 'Processing is applied to the take and kept for the next takes.')));
  }
  const fxExtraHosts = new Set();
  const meters = new Set();
  const nrStats = new Set();
  /** Шумодав микрофона: переключатель, сила, живой индикатор подавления. */
  function nrControls() {
    return h('div', { style: 'display:grid;gap:8px' },
      profileRow(),
      h('div', { class: 'vxp-hint' }, tr('Шумодав применяется к записанному дублю: сила настраивается в обработке («Шумодав»). «Запомнить шум» делает очистку точнее.', 'Denoise is applied to the recorded take: set its strength in processing (“Denoise”). “Learn noise” makes it more precise.')));
  }
  function profileRow() {
    const info = h('div', { class: 'vxp-hint' });
    info._sync = () => { info.textContent = settings.nrProf ? tr('Профиль шума: запомнен. Шумодав знает ваш фон с первой секунды.', 'Noise profile: learned. The suppressor knows your background from the first second.') : tr('Профиль шума: нет, фон определяется автоматически (на старте чуть хуже).', 'Noise profile: none, background is detected automatically (slightly worse at the start).'); };
    info._sync(); widgets.add(info);
    const learn = h('button', { class: 'vxp-btn small', type: 'button', title: tr('Молчите 2,5 секунды: шумодав запомнит ваш фон и будет убирать его точнее. Нужен доступ к микрофону', 'Stay silent for 2.5 s: the suppressor learns your background and removes it more precisely. Needs microphone access') }, tr('🎯 Запомнить шум', '🎯 Learn noise'));
    const clear = h('button', { class: 'vxp-btn small', type: 'button', title: tr('Забыть профиль', 'Forget the profile'), onclick: () => { settings.nrProf = null; saveSettings(); audioHook.setProf && audioHook.setProf(); syncWidgets(); toast(tr('Профиль шума сброшен', 'Noise profile cleared')); } }, tr('Сбросить', 'Clear'));
    learn.addEventListener('click', async () => {
      if (learn.disabled || !audioHook.learn) return;
      learn.disabled = true;
      const label = learn.textContent;
      toast(tr('Молчите 2,5 секунды…', 'Stay silent for 2.5 s…'));
      let left = 3, t = setInterval(() => { learn.textContent = '… ' + Math.max(0, --left) + ' ' + tr('с', 's'); }, 1000);
      learn.textContent = '… 3 ' + tr('с', 's');
      try {
        const r = await audioHook.learn(2.5);
        settings.nrProf = { sr: r.sr, p: r.prof.map((v) => +v.toPrecision(4)) };
        saveSettings(); audioHook.setProf && audioHook.setProf(); syncWidgets();
        toast(tr('Шум запомнен', 'Noise learned'));
      } catch (e) { toast(tr('Не удалось: нужен доступ к микрофону', 'Failed: microphone access is required'), 'err'); console.warn('[Voxalike+OrdaxEd] learn', e); }
      clearInterval(t); learn.textContent = label; learn.disabled = false;
    });
    return h('div', { style: 'display:grid;gap:6px' }, h('div', { class: 'vxp-row' }, learn, clear), info);
  }
  function tickNR() {
    const n = audioHook.last, on = !!(n && n.nrNode);
    for (const st of nrStats) {
      if (!st.isConnected) { nrStats.delete(st); continue; }
      st.classList.toggle('on', on);
      const red = on ? clamp(n.nrRed, 0, 30) : 0;
      st.firstChild.firstChild.style.width = (red / 30 * 100) + '%';
      st.lastChild.textContent = !settings.nr ? tr('выключен', 'off') : on ? tr('подавление −', 'reduction −') + red.toFixed(1) + ' ' + tr('дБ', 'dB') : tr('включится при записи', 'starts on recording');
    }
  }
  function tickMeters() {
    tickNR();
    const lvl = meterLevel();
    for (const m of meters) {
      if (!m.isConnected) { meters.delete(m); continue; }
      m.classList.toggle('idle', lvl == null);
      if (lvl != null) { m.firstChild.style.width = clamp(Math.sqrt(lvl) * 100, 0, 100) + '%'; m.style.setProperty('--w', m.clientWidth + 'px'); }
    }
    raf(tickMeters);
  }
  raf(tickMeters);

  /* ---------- отсчёт ---------- */
  /** Показывает 3-2-1 поверх rectEl (или внутри host). Возвращает true, если не отменён. */
  function countdown(secs, { rectEl, host } = {}) {
    return new Promise((resolve) => {
      if (!secs) return resolve(true);
      const num = h('b'), el = h('div', { class: 'vxp-count' + (host ? ' in' : ''), title: tr('Клик или Esc — отмена', 'Click or Esc — cancel') }, num, h('small', null, tr('Приготовьтесь · Esc — отмена', 'Get ready · Esc — cancel')));
      if (host) host.append(el);
      else {
        const r = (rectEl && rectEl.getBoundingClientRect()) || { left: innerWidth / 2 - 150, top: innerHeight / 2 - 100, width: 300, height: 200 };
        Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
        hostDoc().body.append(el);
      }
      const hd = hostDoc();
      let n = secs, timer = 0, done = false;
      const finish = (ok) => { if (done) return; done = true; wct(timer); el.remove(); hd.removeEventListener('keydown', onKey, true); resolve(ok); };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } };
      hd.addEventListener('keydown', onKey, true);
      el.addEventListener('click', () => finish(false));
      const tick = () => {
        if (n <= 0) { if (settings.countBeep) beep(1320, 0.18, 0.14); finish(true); return; }
        num.textContent = String(n);
        num.style.animation = 'none'; void num.offsetWidth; num.style.animation = '';
        if (settings.countBeep) beep(880, 0.1, 0.1);
        n--; timer = wst(tick, 1000);
      };
      tick();
    });
  }

  /* ================================================================== */
