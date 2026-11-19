const fs = require('fs');
const T = require('./load.js')(process.env.VXP_MAIN);
// достаём методы-ядра Мастера из класса как есть
const src = fs.readFileSync(process.env.VXP_MAIN || require('path').join(__dirname, '..', 'extension-build', 'vxp-main.js'), 'utf8').split('\n');
function method(name) {
  const a = src.findIndex((l) => l.startsWith('    ' + name + '('));
  if (a < 0) throw new Error('нет метода ' + name);
  let b = a; if (!/^    \S.*\}\s*$/.test(src[a]) || src[a].trim().endsWith('{')) { b = a + 1; while (src[b] !== '    }') b++; }
  return src.slice(a, b + 1).join('\n');
}
module.exports = { T, method, src };
