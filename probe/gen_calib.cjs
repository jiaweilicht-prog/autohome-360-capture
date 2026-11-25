// gen_calib.cjs —— 根据标定结果生成 config/p1-calibration.json
//   V1: 参考图自动匹配（已定）
//   V2: 相对 V1 的暂定偏移（主驾视角接 IP 的门特征；方向为猜测，待确认）
//   V3: 副驾 scene 的暂定偏移（相对副驾默认视角；方向为猜测，待确认）
//
// 运行：node gen_calib.cjs

const fs = require('fs');
const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const v1 = JSON.parse(fs.readFileSync(path.join(ROOT, 'probe', 'calib_sel', 'v1_result.json'), 'utf8'));

const cfg = {
  meta: {
    description: 'P1 三个目标视角的 krpano 相机角度。V1 由参考图自动标定；V2/V3 为暂定，需人工确认方向后微调。',
    anchor_pano: 76524,
    anchor_scene: v1.driverScene.name,
    generated_at: new Date().toISOString()
  },
  views: {
    V1: {
      name: '主驾前排IP',
      role: 'driver',
      sceneIndex: 0,
      dh: +v1.offsetFromDefault.dh.toFixed(2),
      dv: +v1.offsetFromDefault.dv.toFixed(2),
      dfov: +v1.offsetFromDefault.dfov.toFixed(2),
      provisional: false,
      note: `参考图自动匹配：h=${v1.best.h} v=${v1.best.v} fov=${v1.best.fov}（MSE=${v1.best.mse.toFixed(1)}）`
    },
    V2: {
      name: '主驾门IP交界',
      role: 'driver',
      sceneIndex: 0,
      relTo: 'V1',
      dh: -60,   // 相对 V1 向左(驾驶门)转约 60°；符号/幅度待确认
      dv: -5,
      dfov: 5,   // 稍广，兼顾 IP 与门
      provisional: true,
      note: '暂定：相对 V1 左转接门。方向/幅度待人工确认后调整。'
    },
    V3: {
      name: '副驾门板',
      role: 'passenger',
      sceneIndex: 0,
      dh: 70,    // 副驾默认视角下向右(副驾门)转约 70°；符号/幅度待确认
      dv: 0,
      dfov: 0,
      provisional: true,
      note: '暂定：副驾 scene 下右转看门板。方向/幅度待人工确认后调整。'
    }
  }
};

fs.writeFileSync(path.join(ROOT, 'config', 'p1-calibration.json'), JSON.stringify(cfg, null, 2));
console.log('已生成 config/p1-calibration.json');
console.log('V1 偏移:', cfg.views.V1.dh, cfg.views.V1.dv, cfg.views.V1.dfov);
