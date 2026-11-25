export function requestPrice(request) {
  const total = request.agreed_budget ?? request.budget;
  if (total == null || !Number.isFinite(Number(total))) return "A combinar";
  return new Intl.NumberFormat("pt-BR", {style:"currency", currency:"BRL", maximumFractionDigits:Number(total)%1 ? 2 : 0}).format(Number(total));
}

export function groupRequests(requests, now = Date.now()) {
  const groups = new Map();
  for (const request of requests) {
    if (!Number.isFinite(request.lat) || !Number.isFinite(request.lng) || Math.abs(request.lat)>90 || Math.abs(request.lng)>180) continue;
    if (request.status && request.status !== "pendente") continue;
    if (request.is_expired || (request.expires_at && new Date(request.expires_at).getTime() <= now)) continue;
    const key = request.lat.toFixed(5)+":"+request.lng.toFixed(5);
    if (!groups.has(key)) groups.set(key, {key, lat:request.lat, lng:request.lng, items:[]});
    groups.get(key).items.push(request);
  }
  return [...groups.values()];
}
