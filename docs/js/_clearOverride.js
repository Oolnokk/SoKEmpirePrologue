// app.js patch — clear any legacy global pose override before boot
// (Some older builds used window.GAME.poseOverride without TTL.)
(function clearLegacyOverride(){ try{ if (window.GAME && window.GAME.poseOverride){ delete window.GAME.poseOverride; } }catch(_){} })();
