import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

function getConfig() {
  const cfg = window.__APP_CONFIG__ || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    renderError("Supabase is not configured. Copy config.example.js to config.js and set supabaseUrl and supabaseAnonKey.");
    throw new Error("Missing Supabase config");
  }
  return cfg;
}

function parseHandleFromPath(defaultHandle) {
  const path = location.pathname.replace(/\/+$/, "");
  const segs = path.split("/").filter(Boolean);
  return segs[0] || defaultHandle || "warren";
}

function buildVCard(data) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${data.name || ""};;;;`,
    `FN:${data.name || ""}`,
  ];
  if (data.title) lines.push(`TITLE:${data.title}`);
  if (data.company_name || data.department) lines.push(`ORG:${data.company_name || ""};${data.department || ""}`);
  if (data.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${data.email}`);
  if (data.phone_number) lines.push(`TEL;TYPE=CELL,VOICE:${data.phone_number}`);
  if (data.company_address) lines.push(`ADR;TYPE=WORK:${data.company_address}`);
  lines.push("END:VCARD");
  return lines.join("\n");
}

function renderCard(card) {
  const container = document.getElementById("card");
  if (!card) {
    container.classList.remove("loading");
    container.innerHTML = `
      <div class="card not-found">
        <h1>🙈 Name card not found</h1>
        <p>We couldn't find a card for that path.</p>
        <a class="button" href="/">Go to default card</a>
      </div>
    `;
    return;
  }

  const html = `
    <div class="header">
      <div class="identity">
        <div class="name">${card.name || ""}</div>
        <div class="title">${[card.title, card.company_name].filter(Boolean).join(" · ")}</div>
      </div>
    </div>
    <div class="tags">
      ${card.department ? `<div class="tag-item"><span class="tag">Department</span><span class="tag-value">${card.department}</span></div>` : ""}
      ${card.email ? `<div class="tag-item"><span class="tag">Email</span><a class="tag-value" href="mailto:${card.email}">${card.email}</a></div>` : ""}
      ${card.phone_number ? `<div class="tag-item"><span class="tag">Phone</span><a class="tag-value" href="tel:${card.phone_number}">${card.phone_number}</a></div>` : ""}
      ${card.company_address ? `<div class="tag-item"><span class="tag">Address</span><span class="tag-value">${card.company_address}</span></div>` : ""}
    </div>
    <div class="actions">
      <button class="button" id="add-contact">Add to contacts</button>
      ${card.email ? `<a class="button secondary" href="mailto:${card.email}">Email</a>` : ""}
    </div>
    <div class="hint">Use the button to add this contact to your phone.</div>
  `;

  container.classList.remove("loading");
  container.innerHTML = html;

  const btn = document.getElementById("add-contact");
  btn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const vcard = buildVCard(card);
    const blob = new Blob([vcard], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (card.name || "contact").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".vcf";
    document.body.appendChild(a);
    a.click();
    requestAnimationFrame(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    });
  });
}

function renderError(message) {
  const container = document.getElementById("card");
  container.classList.remove("loading");
  container.innerHTML = `<div class="card not-found"><h1>⚠️ Error</h1><p>${message}</p></div>`;
}

async function main() {
  try {
    const { supabaseUrl, supabaseAnonKey, defaultHandle } = getConfig();
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const handle = parseHandleFromPath(defaultHandle);

    // Fetch by handle (path segment). You can also use id.
    const { data, error } = await supabase
      .from("cards")
      .select("name,title,company_name,department,email,phone_number,company_address")
      .eq("handle", handle)
      .maybeSingle();

    if (error) {
      console.error(error);
      renderError("Failed to load card.");
      return;
    }

    renderCard(data || null);
  } catch (err) {
    console.error(err);
    // renderError called earlier for missing config
  }
}

main();
