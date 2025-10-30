// animator.js — applies preset poses to fighter jointAngles
export function updatePoses(){
  const C = window.CONFIG || {};
  const G = window.GAME || {};
  const P = G.FIGHTERS?.player;
  if(!P) return;

  const deg2rad = (d)=> d * Math.PI / 180;

  // Decide which pose is active
  let poseName = 'Stance';
  if (P.attack?.active){ poseName = P.attack.currentPhase || poseName; }

  // Try preset-aligned pose first
  let pose = null;
  const pr = C.presets?.[P.attack?.preset || ''] || {};
  if (pr.poses && poseName in pr.poses) pose = pr.poses[poseName];
  if (!pose){ pose = (C.poses && C.poses[poseName]) || {}; }

  // Minimal joint application (fallback-friendly)
  const ja = P.jointAngles = P.jointAngles || {};
  ja.torso = deg2rad(pose.torso ?? 0);
  ja.lShoulder = deg2rad(pose.lShoulder ?? -20);
  ja.lElbow    = deg2rad(pose.lElbow ?? -40);
  ja.rShoulder = deg2rad(pose.rShoulder ??  20);
  ja.rElbow    = deg2rad(pose.rElbow ??   40);
  ja.lHip      = deg2rad(pose.lHip ??    10);
  ja.lKnee     = deg2rad(pose.lKnee ??   10);
  ja.rHip      = deg2rad(pose.rHip ??   -10);
  ja.rKnee     = deg2rad(pose.rKnee ??  -10);
}
