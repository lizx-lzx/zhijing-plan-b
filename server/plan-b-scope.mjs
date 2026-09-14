import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fs.realpathSync(
  fileURLToPath(new URL("../", import.meta.url)),
);

function insideProject(target) {
  const relative = path.relative(projectRoot, target);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

// Check existing ancestors too, so a symlink cannot silently point back at Plan A.
export function projectPath(value, fallback) {
  const target = path.resolve(projectRoot, value || fallback);
  if (!insideProject(target))
    throw new Error("Plan B 的配置和数据必须位于副本目录内。");
  let ancestor = target;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  if (!insideProject(fs.realpathSync(ancestor)))
    throw new Error("Plan B 不使用指向其他项目的配置或数据链接。");
  return target;
}
