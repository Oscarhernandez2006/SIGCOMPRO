// Documento oculto: mantiene el formulario de ADRES cargado en un iframe y le
// pasa la cédula cuando SIGCOMPRO pide una consulta.
const URL_FORMULARIO = "https://aplicaciones.adres.gov.co/BDUA_Internet/Pages/ConsultarAfiliadoWeb_2.aspx";
const ORIGEN_ADRES = "https://aplicaciones.adres.gov.co";
const marco = document.getElementById("adres");

function cargar() {
  marco.src = "about:blank";
  setTimeout(() => {
    marco.src = URL_FORMULARIO;
  }, 50);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.destino !== "offscreen") return;
  if (msg.tipo === "cargar") cargar();
  if (msg.tipo === "consultar") {
    marco.contentWindow?.postMessage({ tipo: "SIGCOMPRO_CONSULTAR", cedula: msg.cedula }, ORIGEN_ADRES);
  }
});

cargar();
