// --- CONFIGURACIÓN DE URLs ---
const URL_TARIFAS = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSrtnD4dghaCICeC6bZjuO2N3fSptB-S2n4lJpNVOq6xr1UjOmZDKq65Df18CMFrL7PLvSvV91K5Ts9/pub?gid=1563729170&single=true&output=csv";
const URL_INFLACION = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSrtnD4dghaCICeC6bZjuO2N3fSptB-S2n4lJpNVOq6xr1UjOmZDKq65Df18CMFrL7PLvSvV91K5Ts9/pub?gid=1758132346&single=true&output=csv";
const URL_SALARIOS = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSrtnD4dghaCICeC6bZjuO2N3fSptB-S2n4lJpNVOq6xr1UjOmZDKq65Df18CMFrL7PLvSvV91K5Ts9/pub?gid=2063311677&single=true&output=csv";

let listaTarifas = [], datosInflacion = [], datosSalarios = [], datosClienteActual = [];
let miGrafico, miGraficoSalarios;

// --- CARGA Y PROCESAMIENTO ---
async function cargarDatos() {
    try {
        const [resT, resI, resS] = await Promise.all([fetch(URL_TARIFAS), fetch(URL_INFLACION), fetch(URL_SALARIOS)]);
        const [txtT, txtI, txtS] = await Promise.all([resT.text(), resI.text(), resS.text()]);
        listaTarifas = procesarCSV(txtT, 'tarifas');
        datosInflacion = procesarCSV(txtI, 'ipc');
        datosSalarios = procesarCSV(txtS, 'salarios');
        cargarSelectClientes();
    } catch (e) { console.error("Error cargando datos:", e); }
}

function procesarCSV(texto, tipo) {
    const filas = texto.split(/\r?\n/).filter(f => f.trim() !== "");
    return filas.slice(1).map(fila => {
        const col = fila.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/"/g, '').trim());
        if (tipo === 'tarifas') return { cliente: col[0], servicio: col[1], mes: col[4]?.toLowerCase(), año: col[5], tarifa: col[6] };
        if (tipo === 'ipc') return { mes: col[0]?.toLowerCase(), año: col[1], variacion: parseFloat(col[3]?.replace(',', '.') || 0) };
        if (tipo === 'salarios') {
            let v = parseFloat((col[10] || col[9] || "0").replace('%', '').replace(',', '.')) || 0;
            return { mes: col[0]?.toLowerCase(), año: col[1], variacion: v >= 1 ? v / 100 : v };
        }
    }).filter(i => i && i.mes);
}

function obtenerMesNumero(mes) {
    return ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"].indexOf(mes.toLowerCase());
}

// --- LÓGICA DE CÁLCULO FINANCIERO (ACUMULADOS) ---
function calcularAcumuladoMercado(anio, tipo, mesesAtras) {
    const fuente = tipo === 'ipc' ? datosInflacion : datosSalarios;
    const datosAnio = fuente.filter(d => d.año === anio.toString())
        .sort((a, b) => obtenerMesNumero(a.mes) - obtenerMesNumero(b.mes));

    if (datosAnio.length === 0) return 0;

    // DETERMINAR EL MES FINAL: Si hay datos hasta Marzo, el fin es el índice de Marzo.
    const fin = obtenerMesNumero(datosAnio[datosAnio.length - 1].mes);
    const inicio = Math.max(0, fin - (mesesAtras - 1));

    let acumulado = 1;
    for (let i = inicio; i <= fin; i++) {
        const mesData = datosAnio.find(d => obtenerMesNumero(d.mes) === i);
        if (mesData) {
            let v = mesData.variacion;
            if (v > 1) v = v / 100;
            acumulado *= (1 + v);
        }
    }
    return acumulado - 1;
}

// --- BOTONES ---
// --- BOTONES (CORREGIDO PARA MILLONES) ---
document.getElementById("btn-buscar").addEventListener("click", () => {
    const cli = document.getElementById("filtro-cliente").value;
    const mes = document.getElementById("filtro-mes").value.toLowerCase();
    const anio = document.getElementById("filtro-año").value;

    if (!cli) return alert("Seleccione un cliente");

    datosClienteActual = listaTarifas.filter(t => t.cliente === cli).map(t => {
        let n = (t.tarifa || "0").trim();
        let v = 0;

        // LÓGICA DE DETECCIÓN DE FORMATO
        if (n.includes(',') && n.includes('.')) {
            // Caso: "1.234.567,89" -> Quitamos puntos, cambiamos coma por punto
            v = parseFloat(n.replace(/\./g, '').replace(',', '.')) || 0;
        } else if (n.includes(',')) {
            // Caso: "61000,50" -> Cambiamos coma por punto
            v = parseFloat(n.replace(',', '.')) || 0;
        } else if (n.split('.').length > 2) {
            // Caso: "1.234.567" (más de un punto es mil)
            v = parseFloat(n.replace(/\./g, '')) || 0;
        } else {
            // Caso simple: "61000"
            v = parseFloat(n) || 0;
        }

        // AUTO-CORRECCIÓN: 
        // Si después de limpiar, el número es absurdamente alto (ej: 6.100.000 en vez de 61.000)
        // y sabemos que ese cliente suele manejar miles, podrías aplicar una regla, 
        // pero con la lógica de arriba ya debería separar 61.000 de 10.000.000.
        
        return { ...t, valor: v };
    }).sort((a, b) => (a.año - b.año) || (obtenerMesNumero(a.mes) - obtenerMesNumero(b.mes)));

    const fila = datosClienteActual.filter(t => t.mes === mes && t.año === anio);
    const cuerpo = document.getElementById("cuerpo-tabla");
    cuerpo.innerHTML = fila.map(i => `<tr><td>${i.cliente}</td><td>${i.servicio}</td><td>ACTIVO</td><td>1</td><td>${i.mes}</td><td>${i.año}</td><td>$${i.valor.toLocaleString('es-AR')}</td></tr>`).join('');
});
// --- BOTÓN ANALIZAR ---
// --- BOTÓN ANALIZAR COMPLETO (ANUAL, SEMESTRAL, TRIMESTRAL) ---
document.getElementById("btn-analizar").addEventListener("click", () => {
    const anioSel = document.getElementById("filtro-anio-kpi").value;
    const anioAnt = (parseInt(anioSel) - 1).toString();

    // 1. Datos reales del año seleccionado
    const datosRealesAnio = datosClienteActual.filter(d => d.año === anioSel)
        .sort((a, b) => obtenerMesNumero(a.mes) - obtenerMesNumero(b.mes));

    if (datosRealesAnio.length === 0) return alert("No hay datos para este año");

    // 2. Base de cálculo (Diciembre anterior)
    const dicAnt = datosClienteActual.find(d => d.año === anioAnt && d.mes === "diciembre");
    const vBaseReal = dicAnt ? dicAnt.valor : datosRealesAnio[0].valor;

    // 3. Valores para las variaciones
    const ultimoDato = datosRealesAnio[datosRealesAnio.length - 1];
    const vFinal = ultimoDato.valor;
    const mesFinalIdx = obtenerMesNumero(ultimoDato.mes);
    const mesesTranscurridos = mesFinalIdx + 1;

    // --- CÁLCULO DE VARIACIONES PROPIAS ---
// --- CÁLCULO DE VARIACIONES PROPIAS (CORREGIDO PARA EVITAR INFINITY) ---
    
    // Anual: Si no existe vBaseReal o es 0 (cliente nuevo), la variación es 0
    const varAnual = (vBaseReal > 0) ? ((vFinal - vBaseReal) / vBaseReal) * 100 : 0;
    
    // Semestral: Si no existe vJun o es 0, la variación es 0
    const vJun = (datosRealesAnio.find(d => d.mes === "junio") || {}).valor;
    const varSemestre = (vJun > 0 && mesFinalIdx >= 5) ? ((vFinal - vJun) / vJun) * 100 : 0;
    
    // Trimestral: Si no existe vSep o es 0, la variación es 0
    const vSep = (datosRealesAnio.find(d => d.mes === "septiembre") || {}).valor;
    const varTrimestre = (vSep > 0 && mesFinalIdx >= 8) ? ((vFinal - vSep) / vSep) * 100 : 0;
    // Actualizar UI de variaciones
    document.getElementById("var-12meses").innerText = varAnual.toFixed(1) + "%";
    document.getElementById("var-6meses").innerText = varSemestre.toFixed(1) + "%";
    document.getElementById("var-3meses").innerText = varTrimestre.toFixed(1) + "%";

    // --- CÁLCULO DE BRECHAS MERCADO ---
    const infMkt = calcularAcumuladoMercado(anioSel, 'ipc', mesesTranscurridos) * 100;
    const salMkt = calcularAcumuladoMercado(anioSel, 'salarios', mesesTranscurridos) * 100;

    actualizarKPI("kpi-brecha-ipc", "card-brecha-ipc", varAnual - infMkt, infMkt);
    actualizarKPI("kpi-brecha-salarios", "card-brecha-salarios", varAnual - salMkt, salMkt);

    // --- PREPARAR GRÁFICO (CON MEMORIA) ---
    let datosParaGraficar = [...datosRealesAnio];
    if (dicAnt) {
        datosParaGraficar.unshift({ 
            ...dicAnt, 
            mes: "Dic " + anioAnt.slice(-2), 
            isBase: true 
        });
    }

    actualizarGraficos(datosParaGraficar, anioSel, vBaseReal, anioAnt);
});
function filtrarPorRango(meses) {
    if (datosClienteActual.length === 0) return;
    const anioSel = document.getElementById("filtro-anio-kpi").value;
    
    // 1. Obtenemos los datos del año seleccionado
    const datosAnio = datosClienteActual.filter(d => d.año === anioSel)
        .sort((a, b) => obtenerMesNumero(a.mes) - obtenerMesNumero(b.mes));

    if (datosAnio.length < 2) return;

    // 2. Definimos el recorte para el gráfico
    const recorte = datosAnio.slice(-meses); 
    
    // 3. Cálculo de Variación Propia del periodo
    const vF = datosAnio[datosAnio.length - 1].valor; // Diciembre (o último mes)
    const indiceBase = datosAnio.length - 1 - meses; 
    const vI = indiceBase >= 0 ? datosAnio[indiceBase].valor : datosAnio[0].valor;
    const varPropia = ((vF - vI) / vI) * 100;
    
    // 4. Cálculo de Inflación y Salarios del periodo (Dinámico: 3, 6 o 12)
    const infRecorte = calcularAcumuladoMercado(anioSel, 'ipc', meses) * 100;
    const salRecorte = calcularAcumuladoMercado(anioSel, 'salarios', meses) * 100;

    // 5. Actualizamos las tarjetas con el valor del periodo y su referencia
    actualizarKPI("kpi-brecha-ipc", "card-brecha-ipc", varPropia - infRecorte, infRecorte);
    actualizarKPI("kpi-brecha-salarios", "card-brecha-salarios", varPropia - salRecorte, salRecorte);
    
    // 6. Refrescamos el gráfico
    actualizarGraficos(recorte, anioSel);
}

function actualizarKPI(idTxt, idCard, valorBrecha, valorMercado) {
    const el = document.getElementById(idTxt);
    const card = document.getElementById(idCard);
    if (!el || !card) return;

    // Si el valor es finito lo mostramos, si no (caso extremo), ponemos 0
    const mostrarBrecha = isFinite(valorBrecha) ? valorBrecha.toFixed(1) : "0.0";

    el.innerHTML = `
        ${valorBrecha > 0 ? "+" : ""}${mostrarBrecha}%
        <div style="font-size: 0.65em; color: #666; font-weight: normal; margin-top: 4px; opacity: 0.8;">
            Ref. Mercado: ${valorMercado.toFixed(1)}%
        </div>
    `;
    
    const color = valorBrecha < 0 ? "#e74c3c" : "#27ae60";
    el.style.color = color;
    card.style.borderTop = `4px solid ${color}`;
}

// --- GRÁFICOS ---
// Añadimos vBase como tercer parámetro
function actualizarGraficos(datos, anioSel, vBase) {
    const canvas1 = document.getElementById('graficoTarifas');
    const canvas2 = document.getElementById('graficoSalarios');
    if (!canvas1 || !canvas2) return;

    const etiquetas = datos.map(d => d.mes);
    const valores = datos.map(d => d.valor);
    
    // Si no pasamos vBase (ej. en años viejos), usamos el primer valor disponible
    const baseParaCalculo = vBase || valores[0];

    // --- GRÁFICO 1: TARIFAS VS IPC ---
    if (miGrafico) miGrafico.destroy();
    
    // Ahora usamos baseParaCalculo para que la línea gris empiece en el valor de Dic anterior
    const sugeridoIPC = calcularCurvaReferencia(baseParaCalculo, anioSel, 'ipc', etiquetas);

    miGrafico = new Chart(canvas1, {
        type: 'line',
        data: {
            labels: etiquetas,
            datasets: [
                { label: 'Tarifa Real', data: valores, borderColor: '#ff6600', backgroundColor: 'rgba(255, 102, 0, 0.1)', fill: true, tension: 0.3 },
                { label: 'Sugerido IPC', data: sugeridoIPC, borderColor: '#999', borderDash: [5,5], tension: 0.3 }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (context) => context.dataset.label + ': $' + context.parsed.y.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})
                    }
                }
            },
            scales: {
                y: { 
                    beginAtZero: false,
                    ticks: { callback: (value) => '$' + value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) } 
                }
            }
        }
    });

    // --- GRÁFICO 2: CRECIMIENTO VS SALARIOS (%) ---
    if (miGraficoSalarios) miGraficoSalarios.destroy();
    
    // El porcentaje ahora se calcula contra la base real del año anterior
    const tPct = valores.map(v => ((v - baseParaCalculo) / baseParaCalculo * 100));
    const sPct = calcularCurvaReferenciaPct(anioSel, 'salarios', etiquetas);

    miGraficoSalarios = new Chart(canvas2, {
        type: 'line',
        data: {
            labels: etiquetas,
            datasets: [
                { label: '% Tarifa', data: tPct, borderColor: '#ff6600', tension: 0.3 },
                { label: '% Salarios', data: sPct, borderColor: '#007bff', borderDash: [5,5], tension: 0.3 }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: { ticks: { callback: (value) => value.toFixed(2) + '%' } }
            }
        }
    });
}

// --- CURVAS DE REFERENCIA ---
function calcularCurvaReferencia(base, anio, tipo, mesesVisibles) {
    const fuente = tipo === 'ipc' ? datosInflacion : datosSalarios;
    let curva = [];
    let actual = base;

    mesesVisibles.forEach(mesNombre => {
        const d = fuente.find(f => f.mes === mesNombre && f.año === anio.toString());
        const v = d ? (d.variacion > 1 ? d.variacion / 100 : d.variacion) : 0;
        actual *= (1 + v);
        curva.push(actual);
    });
    return curva;
}

function calcularCurvaReferenciaPct(anio, tipo, mesesVisibles) {
    const fuente = tipo === 'ipc' ? datosInflacion : datosSalarios;
    let curva = [];
    let acumulado = 1;

    mesesVisibles.forEach(mesNombre => {
        const d = fuente.find(f => f.mes === mesNombre && f.año === anio.toString());
        const v = d ? (d.variacion > 1 ? d.variacion / 100 : d.variacion) : 0;
        acumulado *= (1 + v);
        curva.push((acumulado - 1) * 100);
    });
    return curva;
}
// FUNCIONES PARA CURVAS QUE ENTIENDEN EL PUNTO "DIC ANT"
function calcularCurvaReferenciaExtendida(base, anio, tipo, datosGrafico, anioAnt) {
    const fuente = tipo === 'ipc' ? datosInflacion : datosSalarios;
    let actual = base;
    return datosGrafico.map(punto => {
        if (punto.isBase) return base; // El primer punto es el valor de cierre
        const d = fuente.find(f => f.mes === punto.mes && f.año === anio.toString());
        const v = d ? (d.variacion > 1 ? d.variacion / 100 : d.variacion) : 0;
        actual *= (1 + v);
        return actual;
    });
}
document.getElementById("btn-exportar").addEventListener("click", () => {
    // 1. Identificamos qué queremos exportar
    // Si tienes un div envolviendo todo el contenido usa su ID, si no, usamos el body
    const contenido = document.getElementById("contenido-a-exportar") || document.querySelector(".container") || document.body;

    // 2. Obtenemos datos para el nombre del archivo
    const nombreCliente = document.getElementById("filtro-cliente").value || "Cliente";
    const anioAnalizado = document.getElementById("filtro-anio-kpi").value || "Analisis";
    const fechaActual = new Date().toISOString().slice(0, 10);

    // 3. Configuración del PDF
    const opciones = {
        margin:       [0.5, 0.5], // Márgenes [arriba/abajo, izquierda/derecha]
        filename:     `Reporte_${nombreCliente}_${anioAnalizado}_${fechaActual}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { 
            scale: 2,           // Mayor resolución
            useCORS: true,      // Evita problemas con imágenes externas
            letterRendering: true
        },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    // 4. Ejecutar la descarga
    // Ocultamos temporalmente los botones para que no salgan en el PDF
    const botones = document.querySelectorAll('button');
    botones.forEach(btn => btn.style.display = 'none');

    html2pdf().set(opciones).from(contenido).save().then(() => {
        // Volvemos a mostrar los botones después de generar el PDF
        botones.forEach(btn => btn.style.display = 'inline-block');
    });
});
function calcularCurvaReferenciaPctExtendida(anio, tipo, datosGrafico, anioAnt) {
    const fuente = tipo === 'ipc' ? datosInflacion : datosSalarios;
    let acumulado = 1;
    return datosGrafico.map(punto => {
        if (punto.isBase) return 0; // El primer punto es 0% de variación
        const d = fuente.find(f => f.mes === punto.mes && f.año === anio.toString());
        const v = d ? (d.variacion > 1 ? d.variacion / 100 : d.variacion) : 0;
        acumulado *= (1 + v);
        return (acumulado - 1) * 100;
    });
}

function cargarSelectClientes() {
    const s = document.getElementById("filtro-cliente");
    [...new Set(listaTarifas.map(t => t.cliente))].sort().forEach(c => {
        const o = document.createElement("option");
        o.value = o.textContent = c;
        s.appendChild(o);
    });
}

document.getElementById("btn-limpiar").addEventListener("click", () => location.reload());

cargarDatos();
