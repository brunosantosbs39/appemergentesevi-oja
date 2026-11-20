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
const transform = file => babel.transformSync(fs.readFileSync(file, "utf8"), {
  presets: [[req.resolve("@babel/preset-react"), { runtime: "automatic" }]],
  plugins: [req.resolve("@babel/plugin-transform-modules-commonjs")],
  configFile: false, babelrc: false
}).code;
const moduleMock = { exports: {} };
let hash = "";
const mocks = {
  "react-router-dom": { useLocation: () => ({hash}), Link: ({to,children}) => React.createElement("a",{href:to},children) },
  "@tanstack/react-query": { useQueryClient: () => ({}) },
  "@/lib/api": { useApi: () => ({}), errMsg: () => "Error" },
  "@/components/ui/button": { Button: props => React.createElement("button", props) },
  "@/components/ui/dialog": {Dialog:({open,children})=>open?children:null, DialogContent:({children})=>children,DialogTitle:({children})=>children},
  "sonner": { toast: {} },
  "lucide-react": Object.fromEntries(["Copy", "Loader2", "QrCode"].map(k => [k, () => null]))
};
const child = { exports: {} };
vm.runInNewContext(transform(path.join(path.dirname(filename), "PixWithdrawal.jsx")), { module: child, exports: child.exports, require: name => mocks[name] || req(name) });
mocks["./PixWithdrawal"] = child.exports;
vm.runInNewContext(transform(filename), { module: moduleMock, exports: moduleMock.exports,
  require: name => mocks[name] || req(name) }, { filename });
const Component = moduleMock.exports.default;
function render(status) {
  return renderToStaticMarkup(React.createElement(Component, {
    userId: "unit-test", wallet: { enabled: true, withdrawals_enabled: true, deposit_fee_estimate_cents: 99, available_cents: 901,
      operations: [{ id: "op", amount_cents: 1000, status, created_at: new Date().toISOString(), timed:true, slot:0,
        expires_at: new Date(Date.now()+59000).toISOString(), pix_copy_paste: "PIX-UNIT-TEST", qr_image: "YWJj",
        ...(status === "paid" ? { credited_cents: 901 } : {}) }] }
  }));
}
const pending = render("pending");
assert.match(pending, /Ver Pix/);
assert.match(pending, /24,01/);
assert.match(pending, /Tarifa estimada de recebimento/);
assert.doesNotMatch(pending, /PIX-UNIT-TEST/);
assert.doesNotMatch(pending, /data:image\/png;base64,YWJj/);
assert.doesNotMatch(pending, /Código 1 de 3/);
assert.doesNotMatch(pending, /Ambiente de testes|saldo de teste|Solicitar saque/);
assert.doesNotMatch(pending, /Revisar saque/);
hash = "#sacar-saldo";
const withdrawal = render("pending");
for (const label of ["Revisar saque","CPF","CNPJ","E-mail","Telefone com DDD","Chave aleatória"]) assert.ok(withdrawal.includes(label));
assert.doesNotMatch(withdrawal, /PIX-UNIT-TEST/);
hash = "#extrato";
const paid = render("paid");
assert.match(paid, /Pagamento recebido/);
assert.match(paid, /Creditado/);
assert.match(paid, /Tarifa de recebimento/);
assert.doesNotMatch(paid, /PIX-UNIT-TEST|data:image/);
console.log("Production UI: pending Pix, QR, copy code, validity, real labels and paid state passed");
