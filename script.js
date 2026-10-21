(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const form = $("#qr-form");
  const canvas = $("#qr-canvas");
  const emptyState = $("#empty-state");
  const downloadButton = $("#download-btn");
  const errorBox = $("#form-error");
  const toast = $("#toast");
  let currentType = "url";
  let logoImage = null;
  let generated = false;
  let toastTimer;

  $("#year").textContent = new Date().getFullYear();

  function notify(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function setError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function escapeWifi(value) {
    return String(value).replace(/([\\;,:"])/g, "\\$1");
  }

  function getPayload() {
    switch (currentType) {
      case "url": {
        const raw = $("#url-value").value.trim();
        if (!raw) throw new Error("Digite o endereço do site que deseja compartilhar.");
        let parsed;
        try { parsed = new URL(raw); } catch { throw new Error("Digite um endereço válido, por exemplo https://seusite.com.br."); }
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("O link deve começar com http:// ou https://.");
        return parsed.href;
      }
      case "text": {
        const text = $("#text-value").value.trim();
        if (!text) throw new Error("Digite o texto que deseja colocar no QR Code.");
        return text;
      }
      case "contact": {
        const name = $("#contact-name").value.trim();
        const phone = $("#contact-phone").value.trim();
        const email = $("#contact-email").value.trim();
        const org = $("#contact-org").value.trim();
        if (!name && !phone && !email) throw new Error("Preencha pelo menos nome, telefone ou e-mail.");
        const lines = ["BEGIN:VCARD", "VERSION:3.0"];
        if (name) {
          lines.push("FN:" + name.replace(/[\r\n]/g, " "));
          const parts = name.split(/\s+/);
          lines.push("N:" + (parts.length > 1 ? parts.slice(1).join(" ") + ";" + parts[0] : parts[0]));
        }
        if (phone) lines.push("TEL;TYPE=CELL:" + phone.replace(/[\r\n]/g, ""));
        if (email) lines.push("EMAIL:" + email.replace(/[\r\n]/g, ""));
        if (org) lines.push("ORG:" + org.replace(/[\r\n]/g, " "));
        lines.push("END:VCARD");
        return lines.join("\n");
      }
      case "wifi": {
        const ssid = $("#wifi-name").value;
        const password = $("#wifi-password").value;
        const security = $("#wifi-security").value;
        if (!ssid.trim()) throw new Error("Digite o nome da rede Wi-Fi.");
        if (security !== "nopass" && !password) throw new Error("Digite a senha da rede Wi-Fi ou selecione “Sem senha”.");
        return `WIFI:T:${security};S:${escapeWifi(ssid)};P:${security === "nopass" ? "" : escapeWifi(password)};H:${$("#wifi-hidden").checked ? "true" : "false"};;`;
      }
      case "whatsapp": {
        const phone = $("#wa-phone").value.replace(/\D/g, "");
        const message = $("#wa-message").value.trim();
        if (phone.length < 8 || phone.length > 15) throw new Error("Informe um número válido com código do país e DDD.");
        const url = new URL("https://wa.me/" + phone);
        if (message) url.searchParams.set("text", message);
        return url.href;
      }
      default: throw new Error("Selecione um tipo de QR Code.");
    }
  }

  function hexToRgb(hex) {
    const value = hex.replace("#", "");
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  }

  function contrastRatio(hex1, hex2) {
    const lum = (hex) => {
      const rgb = hexToRgb(hex).map(v => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    };
    const a = lum(hex1), b = lum(hex2);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  function drawLogo(ctx, size) {
    if (!logoImage) return;
    const maxSide = Math.round(size * 0.19);
    const ratio = Math.min(maxSide / logoImage.width, maxSide / logoImage.height);
    const width = Math.round(logoImage.width * ratio);
    const height = Math.round(logoImage.height * ratio);
    const x = Math.round((size - width) / 2);
    const y = Math.round((size - height) / 2);
    const pad = Math.round(size * 0.025);
    const radius = Math.round(size * 0.025);

    ctx.save();
    ctx.fillStyle = $("#background").value;
    ctx.beginPath();
    ctx.roundRect(x - pad, y - pad, width + pad * 2, height + pad * 2, radius);
    ctx.fill();
    ctx.drawImage(logoImage, x, y, width, height);
    ctx.restore();
  }

  async function renderQr(payload) {
    if (!window.QRCode || typeof QRCode.toCanvas !== "function") {
      throw new Error("Não foi possível carregar a biblioteca de QR Code. Confira sua conexão e recarregue a página.");
    }
    const size = Number($("#qr-size").value);
    const foreground = $("#foreground").value;
    const background = $("#background").value;
    canvas.width = size;
    canvas.height = size;
    await QRCode.toCanvas(canvas, payload, {
      width: size,
      margin: 3,
      errorCorrectionLevel: logoImage ? "H" : "Q",
      color: { dark: foreground, light: background }
    });
    const ctx = canvas.getContext("2d");
    drawLogo(ctx, size);
    canvas.hidden = false;
    emptyState.hidden = true;
    downloadButton.disabled = false;
    generated = true;
  }

  async function generate(event) {
    if (event) event.preventDefault();
    setError("");
    try {
      const payload = getPayload();
      if (contrastRatio($("#foreground").value, $("#background").value) < 3.2) {
        notify("Atenção: o contraste está baixo. Teste o QR Code antes de usar.");
      }
      await renderQr(payload);
      notify("QR Code gerado com sucesso!");
    } catch (error) {
      setError(error.message || "Não foi possível gerar o QR Code.");
    }
  }

  function switchType(type) {
    currentType = type;
    $$(".type-tab").forEach(button => {
      const active = button.dataset.type === type;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $$(".fields").forEach(panel => {
      const active = panel.id === "fields-" + type;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    setError("");
  }

  $$(".type-tab").forEach(button => button.addEventListener("click", () => switchType(button.dataset.type)));
  form.addEventListener("submit", generate);

  ["foreground", "background"].forEach(id => {
    $("#" + id).addEventListener("input", (event) => {
      $("#" + id + "-hex").textContent = event.target.value.toUpperCase();
      if (generated) generate();
    });
  });
  $("#qr-size").addEventListener("change", () => { if (generated) generate(); });

  // Atualiza a pré-visualização ao editar o conteúdo, se já existir um QR Code.
  ["url-value", "text-value", "contact-name", "contact-phone", "contact-email", "contact-org",
   "wifi-name", "wifi-password", "wifi-security", "wifi-hidden", "wa-phone", "wa-message"].forEach(id => {
    const element = $("#" + id);
    element.addEventListener("input", () => { if (generated) generate(); });
    element.addEventListener("change", () => { if (generated) generate(); });
  });

  $("#logo-file").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      notify("Escolha uma imagem PNG, JPG ou WebP.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify("A imagem deve ter no máximo 5 MB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = async () => {
        logoImage = image;
        $("#logo-status").hidden = false;
        $("#logo-filename").textContent = file.name;
        if (generated) await generate();
        notify("Logotipo adicionado.");
      };
      image.onerror = () => notify("Não foi possível abrir essa imagem.");
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  $("#remove-logo").addEventListener("click", async () => {
    logoImage = null;
    $("#logo-file").value = "";
    $("#logo-status").hidden = true;
    if (generated) await generate();
    notify("Logotipo removido.");
  });

  downloadButton.addEventListener("click", () => {
    if (!generated) return;
    const link = document.createElement("a");
    link.download = `qr-studio-${$("#qr-size").value}px.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    notify("Download do PNG iniciado.");
  });
})();
