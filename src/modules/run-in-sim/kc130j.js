// The KC-130J tanker for the air refuelling run (RS-15; PROPOSED, BUILT AHEAD OF PATRICK'S YES, Dad, 17 Oct 2026): the
// shared C-130J model (ui-kit c130j-model.js, Blender's, DB-35) with its two wing pods, hoses and baskets drawn on it as
// simple shapes, from refuel.js's DROGUE numbers (estimates for the picture). A picture only: no flight numbers. Until
// the model file is in, or for good if it doesn't come, the model's own stand-in shows (the CT-156 drawn at the
// C-130J's length) and the pods, hoses and baskets are still drawn.
//
// The group is in feet in the CT-156's frame (nose +X, left +Y, up +Z), centred where the C-130J model turns about (its
// "wing line"), so world3d.js poses it the way it poses the CT-156.
import { createC130jModel, disposeC130jModel, C130J_LENGTH_FT } from '../../ui-kit/c130j-model.js';
import { createCt156Model, CT156_LENGTH_FT, CT156_UNIT_LENGTH } from '../../ui-kit/ct156-model.js';
import { CT156_FT_PER_UNIT } from '../../ui-kit/ct156-cockpit.js';
import { DROGUE } from './refuel.js';

const COLOURS = Object.freeze({ standIn: '#9aa3ab', pod: '#c9ced3', hose: '#2b2f33', basket: '#e8e8e8', basketRim: '#d23b2f' });

/** The tanker: { group, dispose() }. onReady(): the model file is in (a fresh picture is wanted). */
export function createKc130j(THREE, { onReady = null } = {}) {
  const group = new THREE.Group();
  group.rotation.order = 'ZYX';
  const lengthUnits = (CT156_UNIT_LENGTH * C130J_LENGTH_FT) / CT156_LENGTH_FT; // the C-130J's real length in the CT-156's units
  const model = createC130jModel(THREE, {
    detail: 'high',
    fallback: () => createCt156Model(THREE, { color: COLOURS.standIn, number: 1, lengthFt: lengthUnits }),
    onReady,
  });
  model.scale.setScalar(CT156_FT_PER_UNIT); // the C-130J at its own size, in feet
  group.add(model);

  const owned = [];
  const mat = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, ...extra });
    owned.push(m);
    return m;
  };
  const geo = (g) => {
    owned.push(g);
    return g;
  };
  const D = DROGUE;
  const down = (D.hoseDownDeg * Math.PI) / 180;
  const podMat = mat(COLOURS.pod);
  const hoseMat = mat(COLOURS.hose);
  const basketMat = mat(COLOURS.basket, { side: THREE.DoubleSide });
  const rimMat = mat(COLOURS.basketRim, { side: THREE.DoubleSide });
  const UP_Y = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(Math.cos(down), 0, Math.sin(down)); // from the basket up the hose to the pod
  for (const side of [1, -1]) { // left (+Y) and right
    const y = side * D.podOutFt;
    const pod = new THREE.Mesh(geo(new THREE.CylinderGeometry(D.podDiaFt / 2.6, D.podDiaFt / 2, D.podLengthFt, 16)), podMat);
    pod.rotation.z = Math.PI / 2; // its +Y end (the narrower) turned aft, along −X
    pod.position.set(D.podTailAheadFt + D.podLengthFt / 2, y, D.podUpFt);
    group.add(pod);
    const nose = new THREE.Mesh(geo(new THREE.SphereGeometry(D.podDiaFt / 2, 16, 10)), podMat);
    nose.scale.set(1.6, 1, 1);
    nose.position.set(D.podTailAheadFt + D.podLengthFt, y, D.podUpFt);
    group.add(nose);
    const pylon = new THREE.Mesh(geo(new THREE.BoxGeometry(D.podLengthFt * 0.5, 0.5, 1.6)), podMat);
    pylon.position.set(D.podTailAheadFt + D.podLengthFt * 0.55, y, D.podUpFt + D.podDiaFt / 2 + 0.6);
    group.add(pylon);
    // The hose, straight from the pod's tail down and back to the basket.
    const hose = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.2, 0.2, D.hoseFt, 8)), hoseMat);
    hose.quaternion.setFromUnitVectors(UP_Y, forward); // along the line to the pod, sloping down aft
    hose.position.set(D.podTailAheadFt - (D.hoseFt / 2) * Math.cos(down), y, D.podUpFt - (D.hoseFt / 2) * Math.sin(down));
    group.add(hose);
    // The basket: an open cone, its narrow end on the hose and its mouth aft, with a red rim.
    const bx = D.podTailAheadFt - D.hoseFt * Math.cos(down);
    const bz = D.podUpFt - D.hoseFt * Math.sin(down);
    const basket = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.35, D.basketFt / 2, 2.4, 20, 1, true)), basketMat);
    basket.quaternion.setFromUnitVectors(UP_Y, forward); // the narrow end (+Y) toward the pod, its mouth aft
    basket.position.set(bx - 1.2 * Math.cos(down), y, bz - 1.2 * Math.sin(down));
    group.add(basket);
    const rim = new THREE.Mesh(geo(new THREE.TorusGeometry(D.basketFt / 2, 0.12, 6, 24)), rimMat);
    rim.rotation.y = Math.PI / 2;
    rim.position.set(bx - 2.4 * Math.cos(down), y, bz - 2.4 * Math.sin(down));
    group.add(rim);
  }

  return {
    group,
    dispose() {
      disposeC130jModel(model);
      group.removeFromParent();
      for (const thing of owned) thing.dispose();
      owned.length = 0;
    },
  };
}
