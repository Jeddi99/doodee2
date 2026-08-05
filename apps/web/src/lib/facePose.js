const degrees = (radians) => radians * 180 / Math.PI;
const clamp = (value) => Math.max(-1, Math.min(1, value));

export function poseFromMatrix(matrix) {
  const { rows = 0, columns = 0, data = [] } = matrix || {};
  if (rows < 3 || columns < 3 || data.length < rows * columns) return { yaw: 0, pitch: 0, roll: 0 };
  const at = (row, column) => data[column * rows + row];
  const scale = Math.hypot(at(0, 0), at(1, 0), at(2, 0));
  if (!Number.isFinite(scale) || scale < 1e-6) return { yaw: 0, pitch: 0, roll: 0 };
  return {
    yaw: degrees(Math.asin(clamp(-at(2, 0) / scale))),
    pitch: degrees(Math.atan2(at(2, 1) / scale, at(2, 2) / scale)),
    roll: degrees(Math.atan2(at(1, 0) / scale, at(0, 0) / scale)),
  };
}
