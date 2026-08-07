import './style.css'; 
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, addDoc, deleteDoc, query, where, writeBatch } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";

// 1. CONFIGURACIÓN FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyDXXqcuMvdYZdrwMkw95KwiJ_UD_CIyD8g",
    authDomain: "mi-negocio-d1931.firebaseapp.com",
    projectId: "mi-negocio-d1931",
    storageBucket: "mi-negocio-d1931.firebasestorage.app",
    messagingSenderId: "543739671500",
    appId: "1:543739671500:web:b6abfebbcd6494370f2369",
    measurementId: "G-EKFYTVXJ97"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

window.db = db;
window.inventarioLocal = []; 
window.carrito = [];
window.ordenCompraActual = []; 
window.kardexActual = 'entradas'; 
window.datosReporteCSV = [];
window.categoriasUnicas = new Set(); 

window.mostrarNotificacion = (mensaje) => {
    try { const beep = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg'); beep.volume = 0.5; beep.play(); } catch(e) {}
    const cont = document.getElementById('toast-container'); const t = document.createElement('div');
    t.className = 'toast'; t.innerText = mensaje; cont.appendChild(t);
    setTimeout(() => { if(t.parentNode) t.parentNode.removeChild(t); }, 2000);
};

window.toggleAuth = () => { 
    document.getElementById('loginForm').classList.toggle('hidden'); 
    document.getElementById('registerForm').classList.toggle('hidden'); 
};

window.cambiarPestaña = (idTab) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('button[id^="btn-tab-"]').forEach(btn => {
        btn.classList.remove('tab-active', 'border-b-4', 'border-orange-500', 'text-orange-600');
        btn.classList.add('text-gray-600');
    });
    
    const wrapper = document.getElementById(idTab);
    if(wrapper) wrapper.classList.remove('hidden'); 
    
    const activeBtn = document.getElementById('btn-' + idTab);
    if(activeBtn) {
        activeBtn.classList.add('tab-active', 'border-b-4', 'border-orange-500', 'text-orange-600');
        activeBtn.classList.remove('text-gray-600');
    }
    
    window.detenerCamara('ventas'); window.detenerCamara('ingreso');
    
    if(idTab === 'tab-general' || idTab === 'tab-ventas') window.cargarInventarioGeneral();
    if(idTab === 'tab-kardex') window.cargarKardex(window.kardexActual);
    if(idTab === 'tab-usuarios') window.cargarUsuarios();
    if(idTab === 'tab-agotados') window.renderAgotados();
    if(idTab === 'tab-proveedores') window.cargarProveedores();
};

window.alCambiarZona = () => { 
    window.cargarInventarioGeneral(); 
    if(!document.getElementById('tab-kardex').classList.contains('hidden')) window.cargarKardex(window.kardexActual); 
    if(!document.getElementById('tab-reportes').classList.contains('hidden')) window.generarReporte(); 
};

window.calcularPrecioExacto = (p, cantVenta) => {
    let pFinal = p.precio;
    if (p.precio_promo && p.precio_promo > 0) pFinal = p.precio_promo;
    if (p.cant_mayoreo > 0 && cantVenta >= p.cant_mayoreo && p.precio_mayoreo > 0) pFinal = p.precio_mayoreo;
    return pFinal;
};

window.registrarNegocio = async () => { 
    const btn = document.getElementById('btnRegister'); 
    const e = document.getElementById('regEmpresa').value.trim().toUpperCase(); 
    const z = document.getElementById('regZona').value.trim(); 
    const u = document.getElementById('regUser').value.trim(); 
    const em = document.getElementById('regEmail').value.trim().toLowerCase(); 
    const p = document.getElementById('regPass').value.trim();
    
    if(!e || !z || !u || !em || !p) return alert("Llena todos los campos."); 
    btn.innerText = "Creando base de datos..."; btn.disabled = true;
    
    try { 
        const cred = await createUserWithEmailAndPassword(auth, em, p); 
        const uid = cred.user.uid; 
        await setDoc(doc(db, "SaaS_Directorio", u), { email: em, uid: uid }); 
        await setDoc(doc(db, "SaaS_Usuarios", uid), { empresaId: e.replace(/\s+/g, ''), zonas: [z], rol: "Dueño", usuario: u }); 
        alert("Negocio creado. Inicia sesión."); 
        window.toggleAuth(); 
    } catch (er) { alert("Error: " + er.message); } finally { btn.innerText = "Crear Cuenta Principal"; btn.disabled = false; }
};

window.iniciarSesion = async () => { 
    const btn = document.getElementById('btnLogin'); 
    const u = document.getElementById('loginUser').value.trim(); 
    const p = document.getElementById('loginPass').value.trim();
    if(!u || !p) return alert("Faltan datos"); 
    btn.innerText = "Conectando..."; btn.disabled = true;
    
    try {
        const dirDoc = await getDoc(doc(db, "SaaS_Directorio", u)); 
        if(!dirDoc.exists()) { btn.innerText = "Entrar"; btn.disabled = false; return alert("Usuario no encontrado."); }
        const cred = await signInWithEmailAndPassword(auth, dirDoc.data().email, p); 
        const userDoc = await getDoc(doc(db, "SaaS_Usuarios", cred.user.uid));
        
        if (userDoc.exists()) { 
            const d = userDoc.data(); 
            localStorage.setItem('currentUser', u); 
            localStorage.setItem('empresaId', d.empresaId); 
            localStorage.setItem('zonas', JSON.stringify(d.zonas || [])); 
            localStorage.setItem('userRol', d.rol || "Vendedor"); 
            iniciarApp(); 
        }
    } catch (er) { alert("Contraseña incorrecta o error."); } finally { btn.innerText = "Entrar"; btn.disabled = false; }
};

window.recuperarPassword = async () => { 
    const u = prompt("Ingresa tu Usuario:"); if(!u) return; 
    try { 
        const dirDoc = await getDoc(doc(db, "SaaS_Directorio", u)); 
        if(!dirDoc.exists()) return alert("No existe el usuario."); 
        await sendPasswordResetEmail(auth, dirDoc.data().email); 
        alert(`Enlace enviado.`); 
    } catch(e) { alert("Error."); } 
};

window.cerrarSesion = () => { localStorage.clear(); location.reload(); };

function iniciarApp() {
    try {
        document.getElementById('authScreen').classList.add('hidden'); 
        document.getElementById('appScreen').classList.remove('hidden');
        const e = localStorage.getItem('empresaId') || "Negocio"; 
        const u = localStorage.getItem('currentUser') || "Usuario"; 
        const r = localStorage.getItem('userRol') || "Vendedor"; 
        let zs = JSON.parse(localStorage.getItem('zonas') || "['General']"); 
        
        document.getElementById('displayEmpresa').innerText = e; 
        document.getElementById('displayUser').innerText = `${u} (${r})`;
        
        const sZ = document.getElementById('zonaSelect'); 
        sZ.innerHTML = ""; zs.forEach(z => sZ.add(new Option(z, z)));

        if (r === 'Dueño' || r === 'Gerente') {
            ['btn-tab-registro','btn-tab-kardex','btn-tab-reportes','btn-tab-agotados','btn-tab-proveedores','btn-tab-orden','btnAgregarZona'].forEach(id => {
                const b = document.getElementById(id); if(b) b.classList.remove('hidden');
            });
            document.querySelectorAll('.costo-col').forEach(el => el.classList.remove('hidden')); 
            document.querySelectorAll('.accion-col').forEach(el => el.classList.remove('hidden'));
        } else { 
            document.querySelectorAll('.costo-col').forEach(el => el.classList.add('hidden')); 
            document.querySelectorAll('.accion-col').forEach(el => el.classList.add('hidden')); 
        }
        
        if (r === 'Dueño') { 
            document.getElementById('btn-tab-usuarios').classList.remove('hidden'); 
            document.getElementById('btnVaciarInventario').classList.remove('hidden'); 
        }
        window.cargarInventarioGeneral();
        window.cargarProveedores();
    } catch (err) { window.cerrarSesion(); }
}

let scanners = { ventas: null, ingreso: null };
window.iniciarCamara = (m) => { 
    document.getElementById(`reader-${m}`).classList.remove('hidden'); 
    document.getElementById(`btn-iniciar-camara-${m}`).classList.add('hidden'); 
    document.getElementById(`btn-detener-camara-${m}`).classList.remove('hidden');
    scanners[m] = new Html5Qrcode(`reader-${m}`);
    scanners[m].start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, (decodedText) => {
        window.detenerCamara(m); 
        if (navigator.vibrate) navigator.vibrate(100); 
        if(m === 'ventas') { 
            const p = window.inventarioLocal.find(x => x.sku === decodedText); 
            if(p) { window.agregarAlCarrito(p); } else {
                document.getElementById('venta_busqueda').value = decodedText;
                window.abrirModalRegistroRapido();
            }
        } else { document.getElementById('p_sku').value = decodedText; }
    }, (e) => { }).catch(err => { alert("Cámara no soportada."); });
};

window.detenerCamara = (m) => { 
    if(scanners[m]) {
        scanners[m].stop().then(() => { 
            document.getElementById(`reader-${m}`).classList.add('hidden'); 
            document.getElementById(`btn-iniciar-camara-${m}`).classList.remove('hidden'); 
            document.getElementById(`btn-detener-camara-${m}`).classList.add('hidden'); 
        }).catch(e=>console.log(e)); 
    }
};

function poblarFiltros() {
    let htmlCat = `<option value="Todas">Todas las categorías</option>`;
    window.categoriasUnicas.forEach(c => { if(c) htmlCat += `<option value="${c}">${c}</option>`; });
    const els = ['filtro_inv_cat', 'alerta_filtro_cat', 'rep_cat'];
    els.forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = htmlCat; });
}

window.cargarInventarioGeneral = async () => {
    const z = document.getElementById('zonaSelect').value; const e = localStorage.getItem('empresaId');
    if(!z || !e) return;
    document.getElementById('tablaInventarioGeneralBody').innerHTML = "<tr><td colspan='7' class='p-8 text-center'>Cargando base de datos...</td></tr>";
    try {
        const sn = await getDocs(collection(db, `${e}_Inventario_${z}`));
        window.inventarioLocal = []; window.categoriasUnicas.clear();
        sn.forEach((d) => {
            const p = d.data(); window.inventarioLocal.push(p);
            if(p.categoria) window.categoriasUnicas.add(p.categoria);
        });
        poblarFiltros(); window.renderInventarioPantalla();
        if(!document.getElementById('tab-agotados').classList.contains('hidden')) window.renderAgotados();
    } catch(err) { document.getElementById('tablaInventarioGeneralBody').innerHTML = "<tr><td colspan='7' class='text-red-500 p-8'>Error al conectar.</td></tr>"; }
};

window.renderInventarioPantalla = () => {
    const r = localStorage.getItem('userRol'); const tb = document.getElementById('tablaInventarioGeneralBody');
    const txt = document.getElementById('filtro_inv_txt').value.toLowerCase();
    const cat = document.getElementById('filtro_inv_cat').value; const ord = document.getElementById('filtro_inv_ord').value;

    let lista = window.inventarioLocal.filter(p => {
        const coincideTxt = p.nombre.toLowerCase().includes(txt) || p.sku.toLowerCase().includes(txt);
        const coincideCat = (cat === "Todas" || p.categoria === cat);
        return coincideTxt && coincideCat;
    });

    if(ord === 'nombre') lista.sort((a,b) => a.nombre.localeCompare(b.nombre));
    if(ord === 'stock_asc') lista.sort((a,b) => a.stock - b.stock);
    if(ord === 'stock_desc') lista.sort((a,b) => b.stock - a.stock);

    let h = "";
    lista.forEach(p => {
        const isManager = (r === 'Dueño' || r === 'Gerente');
        const cc = isManager ? `<td class="p-3 text-left costo-col">$${p.costo || 0}</td>` : `<td class="p-3 text-left costo-col hidden"></td>`;
        const ca = isManager ? `<td class="p-3 text-center accion-col md:min-w-[200px]"><button onclick="abrirModalEdicion('${p.sku}')" class="text-blue-600 bg-blue-50 px-3 py-2 rounded font-bold hover:bg-blue-100 transition mb-1 md:mb-0 md:mr-2 text-lg" title="Editar">✏️</button><button onclick="eliminarProducto('${p.sku}')" class="text-red-600 bg-red-50 px-3 py-2 rounded font-bold hover:bg-red-100 transition text-lg" title="Borrar">🗑️</button></td>` : `<td class="p-3 text-left accion-col hidden"></td>`;
        const stockVal = p.stock % 1 !== 0 ? p.stock.toFixed(3) : p.stock;
        let badges = `<span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded block mb-1 w-fit">${p.categoria || 'General'}</span>`;
        if(p.proveedor) badges += `<span class="bg-teal-50 text-teal-700 text-[10px] font-bold px-2 py-1 rounded block w-fit mb-1 border border-teal-200">🚚 ${p.proveedor}</span>`;
        let precioStr = `<span class="text-green-600 font-bold block">$${p.precio}</span>`;
        h += `<tr class="border-b hover:bg-gray-50"><td class="p-3 font-mono text-gray-500 text-xs hidden">${p.sku}</td><td class="p-3 font-bold">${p.nombre}</td><td class="p-3">${badges}</td><td class="p-3 text-center font-black ${p.stock<=(p.min_stk||0)?'text-red-500':''}">${stockVal}</td>${cc}<td class="p-3 text-left">${precioStr}</td>${ca}</tr>`; 
    }); 
    tb.innerHTML = h || "<tr><td colspan='7' class='text-center p-8 text-gray-500'>No hay productos</td></tr>";
};

window.eliminarProducto = async (sku) => {
    if(!confirm(`⚠️ ¿ELIMINAR ${sku}?`)) return;
    const z = document.getElementById('zonaSelect').value; const e = localStorage.getItem('empresaId'); const u = localStorage.getItem('currentUser');
    try {
        const pRef = doc(db, `${e}_Inventario_${z}`, sku); const pSnap = await getDoc(pRef);
        if(pSnap.exists()) {
            await deleteDoc(pRef);
            await addDoc(collection(db, `${e}_Historial_Ingresos`), { sku, nombre: pSnap.data().nombre, cantidad: pSnap.data().stock, zona: z, usuario: u, fechaRegistro: new Date().toLocaleString('es-MX'), timestamp: Date.now(), tipoMovimiento: "ELIMINACIÓN" });
            window.mostrarNotificacion("🗑️ Eliminado"); window.cargarInventarioGeneral(); 
        }
    } catch(er) { alert("Error."); }
};

window.filtrarProductosVenta = () => {
    const i = document.getElementById('venta_busqueda').value.toLowerCase(); 
    const c = document.getElementById('sugerencias_venta'); c.innerHTML = '';
    if (i.length < 1) { c.classList.add('hidden'); return; }
    const r = window.inventarioLocal.filter(p => p.sku.toLowerCase().includes(i) || p.nombre.toLowerCase().includes(i));
    if (r.length > 0) { 
        c.classList.remove('hidden'); 
        r.forEach(p => { 
            const precioActivo = window.calcularPrecioExacto(p, 1);
            const d = document.createElement('div'); 
            d.className = "p-4 hover:bg-orange-50 cursor-pointer border-b flex justify-between items-center"; 
            d.innerHTML = `<div><span class="text-orange-600 font-bold">${p.sku}</span><br><span class="text-gray-700">${p.nombre}</span></div> <div><span class="text-green-600 font-bold">$${precioActivo}</span></div>`; 
            d.onclick = () => { window.agregarAlCarrito(p); document.getElementById('venta_busqueda').value = ''; c.classList.add('hidden'); }; 
            c.appendChild(d); 
        });
    } else { c.classList.add('hidden'); }
};

document.addEventListener('click', (e) => { if(e.target.id !== 'venta_busqueda') { const c = document.getElementById('sugerencias_venta'); if(c) c.classList.add('hidden'); } });

window.agregarAlCarrito = (p) => {
    if(p.stock <= 0) return window.mostrarNotificacion(`⚠️ Agotado.`); 
    const ex = window.carrito.find(i => i.sku === p.sku);
    if (ex) { 
        if(ex.cantidad < p.stock) { ex.cantidad++; ex.precioVentaReal = window.calcularPrecioExacto(ex, ex.cantidad); } 
        else { return window.mostrarNotificacion("⚠️ Límite de stock."); } 
    } else { 
        let n = { ...p, cantidad: 1 }; n.precioVentaReal = window.calcularPrecioExacto(n, 1); window.carrito.push(n); 
    }
    window.renderCarrito();
};

window.cambiarCantidadCarrito = (sku, val) => { 
    let cant = parseFloat(val); if (isNaN(cant) || cant <= 0) cant = 1;
    const item = window.carrito.find(p => p.sku === sku); 
    if(item) { 
        if(!item.es_granel && cant % 1 !== 0) cant = Math.floor(cant); 
        if(cant > item.stock) cant = item.stock; 
        item.cantidad = cant; item.precioVentaReal = window.calcularPrecioExacto(item, cant); 
        window.renderCarrito(); 
    } 
};

window.quitarDelCarrito = (i) => { window.carrito.splice(i, 1); window.renderCarrito(); };

window.renderCarrito = () => {
    const tb = document.getElementById('tabla-carrito'); tb.innerHTML = ''; let t = 0;
    if (window.carrito.length === 0) { 
        tb.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-8">El carrito está vacío</td></tr>'; 
        document.getElementById('gran-total').innerText = "$0.00"; return; 
    }
    window.carrito.forEach((i, idx) => { 
        const sub = i.precioVentaReal * i.cantidad; t += sub; 
        const cant = i.cantidad % 1 !== 0 ? i.cantidad.toFixed(3) : i.cantidad;
        tb.innerHTML += `<tr class="border-b"><td class="py-4 font-bold text-gray-700 text-xs">${i.nombre}</td><td class="py-4 text-center"><input type="number" step="${i.es_granel ? 'any' : '1'}" min="0.01" max="${i.stock}" value="${cant}" onchange="cambiarCantidadCarrito('${i.sku}', this.value)" class="w-20 p-2 border-2 rounded text-center focus:ring-2 focus:ring-orange-500"></td><td class="py-4 text-right text-green-600 font-bold">$${sub.toFixed(2)}</td><td class="py-4 text-right"><button onclick="quitarDelCarrito(${idx})" class="text-red-500 hover:scale-110 transition-transform">🗑️</button></td></tr>`; 
    }); 
    document.getElementById('gran-total').innerText = `$${t.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
};

window.procesarVentaCompleta = async () => {
    if (window.carrito.length === 0) return alert("El carrito está vacío.");
    const btn = document.getElementById('btn-cobrar'); btn.disabled = true; btn.innerText = "Procesando...";
    const z = document.getElementById('zonaSelect').value; const e = localStorage.getItem('empresaId'); const u = localStorage.getItem('currentUser');
    const ts = Date.now(); const f = new Date(ts).toLocaleString('es-MX'); const fol = "TK-" + ts.toString().slice(-6); 
    
    try {
        for (const i of window.carrito) {
            const ref = doc(db, `${e}_Inventario_${z}`, i.sku); const d = await getDoc(ref);
            if (d.exists()) {
                await setDoc(ref, { stock: d.data().stock - i.cantidad }, { merge: true });
                await addDoc(collection(db, `${e}_Historial_Ventas`), { sku: i.sku, nombre: i.nombre, categoria: i.categoria||'General', cantidad: i.cantidad, precioVenta: i.precioVentaReal, zona: z, usuario: u, fechaRegistro: f, timestamp: ts });
            }
        }
        window.carrito = []; window.renderCarrito(); window.cargarInventarioGeneral(); 
        btn.disabled = false; btn.innerText = "✅ Cobrar Venta"; 
        window.mostrarNotificacion("✅ Venta registrada"); 
    } catch(er) { alert("Error."); btn.disabled = false; btn.innerText = "Cobrar Venta"; } 
};

// ==========================================
// NUEVO SISTEMA DE ORDEN DE COMPRA Y ALERTAS
// ==========================================
window.renderAgotados = () => {
    const tb = document.getElementById('tablaAgotadosBody');
    if(!tb) return;
    
    let alertas = window.inventarioLocal.filter(p => p.stock <= (p.min_stk || 0));
    alertas.sort((a, b) => ((b.precio||0)-(b.costo||0)) - ((a.precio||0)-(a.costo||0)));

    let h = "";
    alertas.forEach(p => {
        h += `<tr class="border-b bg-white hover:bg-red-50">
            <td class="p-3"><span class="font-bold">${p.nombre}</span><br><span class="text-[10px] text-gray-500">${p.proveedor || ''}</span></td>
            <td class="p-3 text-center"><span class="font-black text-lg text-red-600">${p.stock}</span></td>
            <td class="p-3"><span class="text-red-600 font-bold">Agotado/Bajo Stock</span></td>
            <td class="p-3 text-right bg-green-50/50">+$${((p.precio||0)-(p.costo||0)).toFixed(2)}</td>
        </tr>`;
    });
    tb.innerHTML = h || "<tr><td colspan='4' class='p-8 text-center font-bold text-green-600'>✅ Todo en orden.</td></tr>";
};

window.generarOrdenCompra = () => {
    let faltantes = window.inventarioLocal.filter(p => parseFloat(p.stock) <= (parseFloat(p.min_stk) || 0));
    if(faltantes.length === 0) return alert("✅ Todo el inventario está por encima del mínimo.");

    window.ordenCompraActual = faltantes.map(p => {
        let sugerido = (parseFloat(p.max_stk) || 0) > 0 ? (parseFloat(p.max_stk) - parseFloat(p.stock)) : 1; 
        return { ...p, pedir: sugerido < 0 ? 0 : sugerido };
    });

    // TELETRANSPORTAMOS A LA PESTAÑA NUEVA
    window.cambiarPestaña('tab-orden');
    window.renderTabOrdenCompra();
};

window.renderTabOrdenCompra = () => {
    const contenedor = document.getElementById('contenedorTarjetasOrden');
    if(!contenedor) return;
    
    let h = ""; let totalCosto = 0;
    if (window.ordenCompraActual.length === 0) {
        contenedor.innerHTML = `<div class="bg-white p-8 rounded-2xl text-center text-gray-400 font-bold border-2 border-dashed">No hay productos en la lista</div>`;
        return;
    }

    window.ordenCompraActual.forEach((p, idx) => {
        let subCosto = (parseFloat(p.costo) || 0) * (parseFloat(p.pedir) || 0);
        totalCosto += subCosto;
        const provStr = p.proveedor ? `🚚 ${p.proveedor}` : '📁 Sin Proveedor';

        h += `
        <div class="bg-white p-4 rounded-2xl shadow-sm border-2 border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div class="flex-1">
                <span class="text-[11px] font-extrabold uppercase tracking-wide text-teal-600 bg-teal-50 px-2 py-0.5 rounded-md mb-1 inline-block">${provStr}</span>
                <h3 class="text-lg font-black text-gray-800 leading-tight">${p.nombre}</h3>
                <div class="flex gap-4 mt-1 text-xs text-gray-500 font-bold">
                    <span>Stock actual: <strong class="text-red-500">${p.stock}</strong></span>
                    <span>Costo: <strong>$${(parseFloat(p.costo)||0).toFixed(2)}</strong></span>
                </div>
            </div>
            <div class="flex items-center justify-between w-full sm:w-auto gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                <div class="flex items-center bg-gray-100 p-1.5 rounded-xl border border-gray-200">
                    <button onclick="window.modificarCantidadBoton(${idx}, -1)" class="w-10 h-10 bg-white text-red-600 rounded-lg font-black text-xl shadow-sm flex items-center justify-center select-none">−</button>
                    <span class="w-12 text-center font-black text-xl text-gray-800 select-none">${p.pedir}</span>
                    <button onclick="window.modificarCantidadBoton(${idx}, 1)" class="w-10 h-10 bg-white text-emerald-600 rounded-lg font-black text-xl shadow-sm flex items-center justify-center select-none">+</button>
                </div>
                <div class="text-right min-w-[80px]">
                    <span class="text-[10px] block text-gray-400 font-bold uppercase">Subtotal</span>
                    <span class="text-base font-black text-orange-600">$${subCosto.toFixed(2)}</span>
                </div>
            </div>
        </div>`;
    });

    contenedor.innerHTML = h;
    document.getElementById('totalOrdenTab').innerText = `$${totalCosto.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
};

window.modificarCantidadBoton = (idx, cambio) => {
    let actual = parseFloat(window.ordenCompraActual[idx].pedir) || 0;
    let nuevo = actual + cambio;
    if (nuevo >= 0) { window.ordenCompraActual[idx].pedir = nuevo; window.renderTabOrdenCompra(); }
};

window.enviarOrdenWhatsApp = () => {
    const e = localStorage.getItem('empresaId'); const z = document.getElementById('zonaSelect').value;
    let filterPedir = window.ordenCompraActual.filter(p => p.pedir > 0); 
    if(filterPedir.length === 0) return alert("Selecciona cantidades mayores a cero usando el botón +");

    let textoMensaje = `📋 *NUEVA ORDEN DE COMPRA*\n🏢 *Negocio:* ${e}\n📍 *Sucursal:* ${z}\n\n*Productos solicitados:*\n`;
    let totalCosto = 0;

    filterPedir.forEach(p => {
        let subCosto = (parseFloat(p.costo) || 0) * p.pedir;
        totalCosto += subCosto;
        textoMensaje += `📦 ${p.pedir} x ${String(p.nombre).substring(0,25)}\n`;
    });

    textoMensaje += `\n💰 *Total Estimado:* $${totalCosto.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(textoMensaje)}`, '_blank');
};

// 9. PROVEEDORES, CARGA MASIVA Y USUARIOS MANTENIDOS IGUAL
window.guardarProveedor = async () => { /* Igual */ };
window.cargarProveedores = async () => { /* Igual */ };
window.eliminarProveedor = async (id) => { /* Igual */ };
window.guardarProducto = async () => { /* Igual */ };
window.abrirModalEdicion = (sku) => { /* Igual */ };
window.cerrarModalEdicion = () => { document.getElementById('modalEdicion').classList.add('hidden'); };
window.guardarEdicionProducto = async () => { /* Igual */ };
window.procesarArchivoMasivo = function() { /* Igual */ };
window.vaciarInventario = async () => { /* Igual */ };
window.generarReporte = async () => { /* Igual */ };
window.descargarCSV = () => { /* Igual */ };
window.cargarKardex = async (tipo = 'entradas') => { /* Igual */ };
window.crearUsuarioSecundario = async () => { /* Igual */ };
window.cargarUsuarios = async () => { /* Igual */ };
window.agregarNuevaZona = async () => { /* Igual */ };
window.abrirModalRegistroRapido = () => { /* Igual */ };
window.cerrarModalRegistroRapido = () => { document.getElementById('modal-registro-rapido').classList.add('hidden'); };
window.guardarRegistroRapido = async () => { /* Igual */ };

if(localStorage.getItem('currentUser')) iniciarApp();