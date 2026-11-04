// Run from repository root: node tests/production_wallet_ui.cjs
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const root = process.env.WALLET_UI_TEST_ROOT || path.resolve(__dirname, "..");
const dependencies = process.env.WALLET_UI_DEPS_ROOT || path.join(root, "frontend");
const req = createRequire(path.join(dependencies, "package.json"));
const React = req("react");
const { renderToStaticMarkup } = req("react-dom/server");
const babel = req("@babel/core");
const filename = process.env.WALLET_UI_SOURCE || path.join(root, "frontend/src/components/wallet/ProductionWallet.jsx");
const code = babel.transformSync(fs.readFileSync(filename, "utf8"), {
  presets: [[req.resolve("@babel/preset-react"), { runtime: "automatic" }]],
  plugins: [req.resolve("@babel/plugin-transform-modules-commonjs")],
  configFile: false, babelrc: false
}).code;
const moduleMock = { exports: {} };
const mocks = {
  "@tanstack/react-query": { useQueryClient: () => ({}) },
  "@/lib/api": { useApi: () => ({}), errMsg: () => "Error" },
  "@/components/ui/button": { Button: props => React.createElement("button", props) },
  "sonner": { toast: {} },
  "lucide-react": Object.fromEntries(["Copy", "Loader2", "QrCode"].map(k => [k, () => null]))
};
vm.runInNewContext(code, { module: moduleMock, exports: moduleMock.exports,
  require: name => mocks[name] || req(name) }, { filename });
const Component = moduleMock.exports.default;
function render(status) {
  return renderToStaticMarkup(React.createElement(Component, {
    userId: "unit-test", wallet: { enabled: true, available_cents: 901,
      operations: [{ id: "op", amount_cents: 1000, status, created_at: "2026-10-28T12:00:00Z",
        expires_at: "2026-10-28 23:59:59", pix_copy_paste: "PIX-UNIT-TEST", qr_image: "YWJj",
        ...(status === "paid" ? { credited_cents: 901 } : {}) }] }
  }));
}
const pending = render("pending");
assert.match(pending, /Aguardando pagamento/);
assert.match(pending, /PIX-UNIT-TEST/);
assert.match(pending, /data:image\/png;base64,YWJj/);
assert.match(pending, /2026-10-28 23:59:59/);
assert.doesNotMatch(pending, /Ambiente de testes|saldo de teste|Solicitar saque/);
const paid = render("paid");
assert.match(paid, /Pagamento recebido/);
assert.match(paid, /Creditado/);
assert.doesNotMatch(paid, /PIX-UNIT-TEST|data:image/);
console.log("Production UI: pending Pix, QR, copy code, validity, real labels and paid state passed");
