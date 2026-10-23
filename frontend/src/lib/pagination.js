export const pageCursor = (item, field = "created_at") => item ? btoa(JSON.stringify([item[field], item.id])).replace(/\+/g, "-").replace(/\//g, "_") : null;
export const mergeItems = (old, page) => [...new Map([...(old || []), ...page].map((item) => [item.id, item])).values()];
