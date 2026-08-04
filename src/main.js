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

// 2. VARIABLES GLOBALES
window.db = db;
window.inventarioLocal = []; 
window.carrito = [];
window.ordenCompraActual = []; 
window.kardexActual = 'entradas'; 
window.datosReporteCSV = [];
window.categoriasUnicas = new Set(); 

// 3. UTILIDADES Y NAVEGACIÓN
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
    document.getElementById(idTab).classList.remove('hidden'); 
    const activeBtn = document.getElementById('btn-' + idTab);
    activeBtn.classList.add('tab-active', 'border-b-4', 'border-orange-500', 'text-orange-600');
    activeBtn.classList.remove('text-gray-600');
    
    window.detenerCamara('ventas'); window.detenerCamara('ingreso');
    
    if(idTab === 'tab-general' || idTab === 'tab-ventas') window.cargarInventarioGeneral();
    if(idTab === 'tab-kardex') window.cargarKardex(window.kardexActual);
    if(idTab === 'tab-usuarios') window.cargarUsuarios();
    if(idTab === 'tab-agotados') window.renderAgotados();
    if(idTab === 'tab-proveedores') window.cargarProveedores();
    if(idTab === 'tab-reportes') {
        const hoy = new Date(); const haceUnaSemana = new Date(); haceUnaSemana.setDate(hoy.getDate() - 7);
        document.getElementById('rep_fin').value = hoy.toISOString().split('T')[0];
        document.getElementById('rep_inicio').value = haceUnaSemana.toISOString().split('T')[0];
    }
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

// 4. AUTENTICACIÓN
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
        // Generamos la credencial segura
        const cred = await createUserWithEmailAndPassword(auth, em, p); 
        const uid = cred.user.uid; // ID de máxima seguridad de Google
        
        // Guardamos el directorio y el perfil ligados al UID
        await setDoc(doc(db, "SaaS_Directorio", u), { email: em, uid: uid }); 
        await setDoc(doc(db, "SaaS_Usuarios", uid), { empresaId: e.replace(/\s+/g, ''), zonas: [z], rol: "Dueño", usuario: u }); 
        
        alert("Negocio creado. Inicia sesión."); 
        window.toggleAuth(); 
    } catch (er) { 
        alert("Error: " + er.message); 
    } finally { 
        btn.innerText = "Crear Cuenta Principal"; btn.disabled = false; 
    }
};
window.iniciarSesion = async () => { 
    const btn = document.getElementById('btnLogin'); 
    const u = document.getElementById('loginUser').value.trim(); 
    const p = document.getElementById('loginPass').value.trim();
    
    if(!u || !p) return alert("Faltan datos"); 
    btn.innerText = "Conectando..."; btn.disabled = true;
    
    try {
        const dirDoc = await getDoc(doc(db, "SaaS_Directorio", u)); 
        if(!dirDoc.exists()) { 
            btn.innerText = "Entrar"; btn.disabled = false; 
            return alert("Usuario no encontrado."); 
        }
        
        const cred = await signInWithEmailAndPassword(auth, dirDoc.data().email, p); 
        const uid = cred.user.uid;
        
        // Buscamos el perfil usando el UID seguro
        const userDoc = await getDoc(doc(db, "SaaS_Usuarios", uid));
        
        if (userDoc.exists()) { 
            const d = userDoc.data(); 
            localStorage.setItem('currentUser', u); 
            localStorage.setItem('empresaId', d.empresaId); 
            localStorage.setItem('zonas', JSON.stringify(d.zonas || [])); 
            localStorage.setItem('userRol', d.rol || "Vendedor"); 
            iniciarApp(); 
        }
    } catch (er) { 
        alert("Contraseña incorrecta o error de conexión."); 
    } finally { 
        btn.innerText = "Entrar"; btn.disabled = false; 
    }
};
window.recuperarPassword = async () => { 
    const u = prompt("Ingresa tu Usuario:"); if(!u) return; 
    try { 
        const dirDoc = await getDoc(doc(db, "SaaS_Directorio", u)); 
        if(!dirDoc.exists()) return alert("No existe el usuario."); 
        await sendPasswordResetEmail(auth, dirDoc.data().email); 
        alert(`Enlace enviado al correo registrado.`); 
    } catch(e) { alert("Error al enviar el enlace."); } 
};

window.cerrarSesion = () => { localStorage.clear(); location.reload(); };

function iniciarApp() {
    try {
        document.getElementById('authScreen').classList.add('hidden'); 
        document.getElementById('appScreen').classList.remove('hidden');
        
        const e = localStorage.getItem('empresaId') || "Negocio"; 
        const u = localStorage.getItem('currentUser') || "Usuario"; 
        const r = localStorage.getItem('userRol') || "Vendedor"; 
        let zs = []; 
        try { 
            zs = JSON.parse(localStorage.getItem('zonas') || "[]"); 
            if (!Array.isArray(zs) || zs.length === 0) zs = ["General"]; 
        } catch(e) { zs = ["General"]; }
        
        document.getElementById('displayEmpresa').innerText = e; 
        document.getElementById('displayUser').innerText = `${u} (${r})`;
        
        const sZ = document.getElementById('zonaSelect'); 
        sZ.innerHTML = ""; 
        zs.forEach(z => sZ.add(new Option(z, z)));

        if (r === 'Dueño' || r === 'Gerente') {
            ['btn-tab-registro','btn-tab-kardex','btn-tab-reportes','btn-tab-agotados','btn-tab-proveedores','btnAgregarZona'].forEach(id => document.getElementById(id).classList.remove('hidden'));
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

// 5. CÁMARA
// 5. CÁMARA
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
            if(p) {
                window.agregarAlCarrito(p); 
            } else {
                // --- NUEVA MAGIA AQUÍ ---
                // 1. Pegamos el código escaneado en el buscador
                document.getElementById('venta_busqueda').value = decodedText;
                // 2. Abrimos la ventana de registro
                window.abrirModalRegistroRapido();
                // 3. Le avisamos al usuario
                window.mostrarNotificacion("⚠️ Nuevo producto detectado. Regístralo.");
            }
        } else { 
            document.getElementById('p_sku').value = decodedText; 
        }
    }, (e) => { }).catch(err => { alert("Cámara no soportada en este dispositivo."); });
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

// 6. INVENTARIO Y FILTROS
function poblarFiltros() {
    let htmlCat = `<option value="Todas">Todas las categorías</option>`;
    window.categoriasUnicas.forEach(c => { if(c) htmlCat += `<option value="${c}">${c}</option>`; });
    document.getElementById('filtro_inv_cat').innerHTML = htmlCat;
    document.getElementById('alerta_filtro_cat').innerHTML = htmlCat;
    document.getElementById('rep_cat').innerHTML = htmlCat;
}

window.cargarInventarioGeneral = async () => {
    const z = document.getElementById('zonaSelect').value; 
    const e = localStorage.getItem('empresaId');
    if(!z || !e) return;
    
    document.getElementById('tablaInventarioGeneralBody').innerHTML = "<tr><td colspan='7' class='p-8 text-center'>Cargando base de datos...</td></tr>";
    
    try {
        const sn = await getDocs(collection(db, `${e}_Inventario_${z}`));
        window.inventarioLocal = []; 
        window.categoriasUnicas.clear();
        
        sn.forEach((d) => {
            const p = d.data(); 
            window.inventarioLocal.push(p);
            if(p.categoria) window.categoriasUnicas.add(p.categoria);
        });
        
        poblarFiltros();
        window.renderInventarioPantalla();
        if(!document.getElementById('tab-agotados').classList.contains('hidden')) window.renderAgotados();
    } catch(err) { 
        document.getElementById('tablaInventarioGeneralBody').innerHTML = "<tr><td colspan='7' class='text-red-500 p-8'>Error al conectar con el inventario</td></tr>"; 
    }
};

window.renderInventarioPantalla = () => {
    const r = localStorage.getItem('userRol'); 
    const tb = document.getElementById('tablaInventarioGeneralBody');
    const txt = document.getElementById('filtro_inv_txt').value.toLowerCase();
    const cat = document.getElementById('filtro_inv_cat').value;
    const ord = document.getElementById('filtro_inv_ord').value;

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
        const ca = isManager ? `<td class="p-3 text-center accion-col md:min-w-[200px]">
            <button onclick="abrirModalEdicion('${p.sku}')" class="text-blue-600 bg-blue-50 px-3 py-2 rounded font-bold hover:bg-blue-100 transition mb-1 md:mb-0 md:mr-2 text-lg" title="Editar">✏️</button>
            <button onclick="eliminarProducto('${p.sku}')" class="text-red-600 bg-red-50 px-3 py-2 rounded font-bold hover:bg-red-100 transition text-lg" title="Borrar">🗑️</button>
        </td>` : `<td class="p-3 text-left accion-col hidden"></td>`;
        
        const stockVal = p.stock % 1 !== 0 ? p.stock.toFixed(3) : p.stock;
        
        let badges = `<span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded block mb-1 w-fit">${p.categoria || 'General'}</span>`;
        if(p.es_granel) badges += `<span class="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded block w-fit font-bold mb-1">Granel</span>`;
        if(p.proveedor) badges += `<span class="bg-teal-50 text-teal-700 text-[10px] font-bold px-2 py-1 rounded block w-fit mb-1 border border-teal-200">🚚 ${p.proveedor}</span>`;
        if(p.caducidad) {
            const diff = Math.floor((new Date(p.caducidad) - Date.now()) / 86400000);
            if(diff <= 30) badges += `<span class="bg-red-100 text-red-700 text-[10px] px-2 py-1 rounded block w-fit font-bold">Vence en ${diff}d</span>`;
        }

        let precioStr = `<span class="text-green-600 font-bold block">$${p.precio}</span>`;
        if (p.precio_promo && p.precio_promo > 0) precioStr = `<span class="text-xs text-red-500 line-through block">$${p.precio}</span><span class="text-green-600 font-bold block">$${p.precio_promo} <span class="text-[10px] text-red-500 font-normal">(Promo)</span></span>`;
        if (p.cant_mayoreo > 0 && p.precio_mayoreo > 0) precioStr += `<span class="text-xs text-blue-600 font-bold block mt-1">$${p.precio_mayoreo} <span class="text-gray-500 font-normal">(x${p.cant_mayoreo}+)</span></span>`;
        
        h += `<tr class="border-b hover:bg-gray-50"><td class="p-3 font-mono text-gray-500 text-xs">${p.sku}</td><td class="p-3 font-bold">${p.nombre}</td><td class="p-3">${badges}</td><td class="p-3 text-center font-black ${p.stock<=(p.min_stk||0)?'text-red-500':''}">${stockVal}</td>${cc}<td class="p-3 text-left">${precioStr}</td>${ca}</tr>`;
    }); 
    tb.innerHTML = h || "<tr><td colspan='7' class='text-center p-8 text-gray-500'>No hay productos que coincidan con el filtro</td></tr>";
};

// FUNCIÓN PARA ELIMINAR 1 SOLO PRODUCTO
window.eliminarProducto = async (sku) => {
    if(!confirm(`⚠️ ¿Estás seguro de ELIMINAR el producto ${sku}? Esta acción no se puede deshacer.`)) return;
    
    const z = document.getElementById('zonaSelect').value;
    const e = localStorage.getItem('empresaId');
    const u = localStorage.getItem('currentUser');
    
    try {
        const pRef = doc(db, `${e}_Inventario_${z}`, sku);
        const pSnap = await getDoc(pRef);
        
        if(pSnap.exists()) {
            const pData = pSnap.data();
            await deleteDoc(pRef);
            
            await addDoc(collection(db, `${e}_Historial_Ingresos`), { 
                sku, nombre: pData.nombre, cantidad: pData.stock, zona: z, usuario: u, 
                fechaRegistro: new Date().toLocaleString('es-MX'), timestamp: Date.now(), tipoMovimiento: "ELIMINACIÓN" 
            });
            
            window.mostrarNotificacion("🗑️ Producto eliminado correctamente");
            window.cargarInventarioGeneral(); 
        }
    } catch(er) {
        alert("Ocurrió un error al intentar eliminar el producto.");
    }
};

// 7. MÓDULO DE VENTAS 
window.filtrarProductosVenta = () => {
    const i = document.getElementById('venta_busqueda').value.toLowerCase(); 
    const c = document.getElementById('sugerencias_venta'); c.innerHTML = '';
    
    if (i.length < 1) { c.classList.add('hidden'); return; }
    const r = window.inventarioLocal.filter(p => p.sku.toLowerCase().includes(i) || p.nombre.toLowerCase().includes(i));
    
    if (r.length > 0) { 
        c.classList.remove('hidden'); 
        r.forEach(p => { 
            const precioActivo = window.calcularPrecioExacto(p, 1);
            const textoPromo = (precioActivo !== p.precio) ? `<span class="text-xs text-red-500 line-through mr-2">$${p.precio}</span>` : '';
            const d = document.createElement('div'); 
            d.className = "p-4 hover:bg-orange-50 cursor-pointer border-b flex justify-between items-center"; 
            d.innerHTML = `<div><span class="text-orange-600 font-bold">${p.sku}</span><br><span class="text-gray-700">${p.nombre}</span></div> <div>${textoPromo}<span class="text-green-600 font-bold">$${precioActivo}</span></div>`; 
            d.onclick = () => { window.agregarAlCarrito(p); document.getElementById('venta_busqueda').value = ''; c.classList.add('hidden'); }; 
            c.appendChild(d); 
        });
    } else { 
        c.classList.add('hidden'); 
    }
};

document.addEventListener('click', (e) => { 
    if(e.target.id !== 'venta_busqueda') document.getElementById('sugerencias_venta').classList.add('hidden'); 
});

window.agregarAlCarrito = (p) => {
    if(p.stock <= 0) return window.mostrarNotificacion(`⚠️ Producto Agotado.`); 
    
    const ex = window.carrito.find(i => i.sku === p.sku);
    if (ex) { 
        if(ex.cantidad < p.stock) { 
            ex.cantidad++; 
            ex.precioVentaReal = window.calcularPrecioExacto(ex, ex.cantidad); 
        } else { 
            return window.mostrarNotificacion("⚠️ Límite de stock alcanzado."); 
        } 
    } else { 
        let n = { ...p, cantidad: 1 }; 
        n.precioVentaReal = window.calcularPrecioExacto(n, 1); 
        window.carrito.push(n); 
    }
    window.mostrarNotificacion(`✅ Agregado al carrito`); 
    window.renderCarrito();
};

window.cambiarCantidadCarrito = (sku, val) => { 
    let cant = parseFloat(val); 
    if (isNaN(cant) || cant <= 0) cant = 1;
    
    const item = window.carrito.find(p => p.sku === sku); 
    if(item) { 
        if(!item.es_granel && cant % 1 !== 0) { 
            window.mostrarNotificacion("⚠️ Este producto no se vende a granel."); 
            cant = Math.floor(cant); 
        }
        if(cant > item.stock) { 
            window.mostrarNotificacion(`⚠️ Solo hay ${item.stock} en stock.`); 
            cant = item.stock; 
        }
        
        item.cantidad = cant; 
        item.precioVentaReal = window.calcularPrecioExacto(item, cant); 
        window.renderCarrito(); 
    } 
};

window.quitarDelCarrito = (i) => { 
    window.carrito.splice(i, 1); 
    window.renderCarrito(); 
};

window.renderCarrito = () => {
    const tb = document.getElementById('tabla-carrito'); tb.innerHTML = ''; let t = 0;
    
    if (window.carrito.length === 0) { 
        tb.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-8">El carrito está vacío</td></tr>'; 
        document.getElementById('gran-total').innerText = "$0.00"; 
        return; 
    }
    
    window.carrito.forEach((i, idx) => { 
        const sub = i.precioVentaReal * i.cantidad; 
        t += sub; 
        const cant = i.cantidad % 1 !== 0 ? i.cantidad.toFixed(3) : i.cantidad;
        const badge = (i.precioVentaReal === i.precio_mayoreo && i.precio_mayoreo > 0) ? `<span class="bg-green-100 text-green-700 text-[10px] px-1 rounded ml-2">MAYOREO</span>` : ``;
        
        tb.innerHTML += `<tr class="border-b">
            <td class="py-4 font-bold text-gray-700 text-xs">${i.nombre}${badge}</td>
            <td class="py-4 text-center">
                <input type="number" step="${i.es_granel ? 'any' : '1'}" min="0.01" max="${i.stock}" value="${cant}" onchange="cambiarCantidadCarrito('${i.sku}', this.value)" class="w-20 p-2 border-2 rounded text-center focus:ring-2 focus:ring-orange-500 transition-all">
            </td>
            <td class="py-4 text-right text-green-600 font-bold">$${sub.toFixed(2)}</td>
            <td class="py-4 text-right"><button onclick="quitarDelCarrito(${idx})" class="text-red-500 hover:scale-110 transition-transform">🗑️</button></td>
        </tr>`; 
    }); 
    document.getElementById('gran-total').innerText = `$${t.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
};

window.procesarVentaCompleta = async () => {
    if (window.carrito.length === 0) return alert("El carrito está vacío.");
    
    const btn = document.getElementById('btn-cobrar'); 
    btn.disabled = true; 
    btn.innerText = "Procesando...";
    
    const z = document.getElementById('zonaSelect').value; 
    const e = localStorage.getItem('empresaId'); 
    const u = localStorage.getItem('currentUser');
    const ts = Date.now(); 
    const f = new Date(ts).toLocaleString('es-MX'); 
    const fol = "TK-" + ts.toString().slice(-6); 
    
    const quiereImprimir = document.getElementById('chk_imprimir').checked;

    let tot = 0; 
    let tkF = "";

    try {
        for (const i of window.carrito) {
            const sub = i.precioVentaReal * i.cantidad; 
            tot += sub; 
            const cTk = i.cantidad % 1 !== 0 ? i.cantidad.toFixed(3) : i.cantidad;
            tkF += `<tr><td style="padding:4px 0; border-bottom:1px dashed #ccc;">${cTk}</td><td style="padding:4px 0; border-bottom:1px dashed #ccc;">${i.nombre.substring(0,18)}</td><td style="padding:4px 0; border-bottom:1px dashed #ccc; text-align:right;">$${sub.toFixed(2)}</td></tr>`;
            
            const ref = doc(db, `${e}_Inventario_${z}`, i.sku); 
            const d = await getDoc(ref);
            if (d.exists()) {
                let updates = { stock: d.data().stock - i.cantidad }; 
                await setDoc(ref, updates, { merge: true });
                await addDoc(collection(db, `${e}_Historial_Ventas`), { sku: i.sku, nombre: i.nombre, categoria: i.categoria||'General', cantidad: i.cantidad, precioVenta: i.precioVentaReal, zona: z, usuario: u, fechaRegistro: f, timestamp: ts });
            }
        }
        
        // REEMPLAZAMOS EL TÍTULO "BOOMBOX" POR EL NOMBRE DE LA EMPRESA (e)
        const htmlTk = `<html><head><title>${e}</title><style>body{font-family:'Courier New',monospace;font-size:12px;margin:0;padding:10px;width:80mm;}h2,p{margin:2px 0;text-align:center;}table{width:100%;border-collapse:collapse;margin-top:10px;}th{border-bottom:1px dashed black;text-align:left;}</style></head><body><h2>${e}</h2><p>Sucursal: ${z}</p><p>Folio: ${fol}</p><p>Fecha: ${f}</p><p>Usuario: ${u}</p><table><thead><tr><th>Cant</th><th>Prod</th><th style="text-align:right;">Total</th></tr></thead><tbody>${tkF}</tbody></table><h3 style="text-align:right;margin-top:10px;">TOTAL: $${tot.toFixed(2)}</h3></body></html>`;
        
        if (quiereImprimir) {
            let ifr = document.getElementById('iframeImpresion'); 
            if(!ifr) { 
                ifr = document.createElement('iframe'); 
                ifr.id = 'iframeImpresion'; 
                ifr.style.display = 'none'; 
                document.body.appendChild(ifr); 
            }
            
            ifr.contentWindow.document.open(); 
            ifr.contentWindow.document.write(htmlTk); 
            ifr.contentWindow.document.close();
            
            setTimeout(() => { 
                ifr.contentWindow.focus(); 
                ifr.contentWindow.print(); 
                limpiarYTerminarVenta(btn);
            }, 500);
        } else {
            limpiarYTerminarVenta(btn);
            window.mostrarNotificacion("✅ Venta registrada silenciosamente"); 
        }
    } catch(er) { 
        alert("Ocurrió un error al procesar la venta."); 
        btn.disabled = false; 
        btn.innerText = "✅ Cobrar e Imprimir"; 
    } 
};

function limpiarYTerminarVenta(btn) {
    window.carrito = []; 
    window.renderCarrito(); 
    window.cargarInventarioGeneral(); 
    btn.disabled = false; 
    btn.innerText = "✅ Cobrar e Imprimir"; 
}

// 8. ALERTAS, ÓRDENES DE COMPRA Y PROVEEDORES
window.renderAgotados = () => {
    const tb = document.getElementById('tablaAgotadosBody');
    const filtroTipo = document.getElementById('alerta_filtro_tipo').value;
    const filtroCat = document.getElementById('alerta_filtro_cat').value;
    const ahora = Date.now();
    let alertas = [];

    window.inventarioLocal.forEach(p => {
        if(filtroCat !== "Todas" && p.categoria !== filtroCat) return;

        const min = p.min_stk || 0;
        let msRestantesCad = p.caducidad ? (new Date(p.caducidad) - ahora) : null;
        let diasCad = msRestantesCad ? Math.ceil(msRestantesCad / 86400000) : null;
        
        let esBajoStock = p.stock <= min;
        let esPorCaducar = diasCad !== null && diasCad <= 30;

        if(!esBajoStock && !esPorCaducar) return; 
        if(filtroTipo === 'stock' && !esBajoStock) return;
        if(filtroTipo === 'caducidad' && !esPorCaducar) return;

        let gananciaNum = (p.precio || 0) - (p.costo || 0);
        let estadoStr = [];
        if(esBajoStock) estadoStr.push(`<span class="text-red-600 font-bold block mb-1">Agotado/Bajo Stock</span>`);
        if(esPorCaducar) estadoStr.push(`<span class="bg-red-500 text-white text-[10px] px-2 py-1 rounded block w-fit">⚠️ Caduca en ${diasCad} días</span>`);

        alertas.push({ ...p, gananciaNum: gananciaNum, estadoHTML: estadoStr.join('') });
    });

    alertas.sort((a, b) => b.gananciaNum - a.gananciaNum);

    let h = "";
    alertas.forEach(p => {
        const s = p.stock % 1 !== 0 ? p.stock.toFixed(3) : p.stock;
        let ganStr = p.gananciaNum > 0 ? `<span class="text-green-600 font-bold">+$${p.gananciaNum.toFixed(2)}</span>` : `<span class="text-gray-400">N/A</span>`;
        let provStr = p.proveedor ? `<span class="text-[10px] text-teal-600 font-bold block mt-1">🚚 ${p.proveedor}</span>` : '';
        h += `<tr class="border-b bg-white hover:bg-red-50 transition">
            <td class="p-3"><span class="font-mono text-gray-500 text-xs block">${p.sku}</span><span class="font-bold">${p.nombre}</span><span class="text-xs text-gray-400 block">${p.categoria||''}</span>${provStr}</td>
            <td class="p-3 text-center"><span class="font-black text-lg text-red-600">${s}</span> <span class="text-gray-400 text-xs block mt-1">Límite: ${p.min_stk||0}</span></td>
            <td class="p-3">${p.estadoHTML}</td>
            <td class="p-3 text-right bg-green-50/50">${ganStr}</td>
        </tr>`;
    });
    tb.innerHTML = h || "<tr><td colspan='4' class='p-8 text-center font-bold text-green-600'>✅ Todo en orden. Sin alertas actuales.</td></tr>";
};

// ----- MÓDULO EDITABLE DE ÓRDENES DE COMPRA -----
window.generarOrdenCompra = () => {
    let faltantes = window.inventarioLocal.filter(p => p.stock <= (p.min_stk || 0));
    
    if(faltantes.length === 0) {
        return alert("✅ Todo el inventario está por encima del mínimo. No se requiere orden de compra.");
    }

    faltantes.sort((a,b) => {
        let provA = a.proveedor || "Z_Sin Proveedor";
        let provB = b.proveedor || "Z_Sin Proveedor";
        return provA.localeCompare(provB) || a.nombre.localeCompare(b.nombre);
    });

    window.ordenCompraActual = faltantes.map(p => {
        let sugerido = (p.max_stk || 0) > 0 ? (p.max_stk - p.stock) : 1; 
        if (sugerido < 0) sugerido = 0;
        return { ...p, pedir: sugerido };
    });

    window.renderModalOrdenCompra();
    document.getElementById('modalOrdenCompra').classList.remove('hidden');
};

window.renderModalOrdenCompra = () => {
    const tb = document.getElementById('tablaOrdenCompraBody');
    let h = "";
    let totalCosto = 0;

    window.ordenCompraActual.forEach((p, idx) => {
        let subCosto = (p.costo || 0) * (p.pedir || 0);
        totalCosto += subCosto;
        
        h += `<tr class="border-b hover:bg-gray-50">
            <td class="p-3 text-xs font-mono text-gray-500">${p.sku}</td>
            <td class="p-3 text-sm font-bold truncate max-w-[200px]">${p.nombre}</td>
            <td class="p-3 text-xs text-teal-700">${p.proveedor || '--'}</td>
            <td class="p-3 text-center font-bold text-red-500">${p.stock}</td>
            <td class="p-3 text-right text-gray-600">$${(p.costo || 0).toFixed(2)}</td>
            <td class="p-3 text-center bg-blue-50">
                <input type="number" min="0" step="${p.es_granel ? 'any' : '1'}" class="w-20 p-2 border-2 rounded text-center font-bold focus:ring-2 focus:ring-blue-500" value="${p.pedir}" onchange="window.actualizarCantOrden(${idx}, this.value)">
            </td>
            <td class="p-3 text-right font-bold text-orange-600">$${subCosto.toFixed(2)}</td>
        </tr>`;
    });

    tb.innerHTML = h;
    document.getElementById('totalOrdenCompra').innerText = `$${totalCosto.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
};

window.actualizarCantOrden = (idx, val) => {
    let v = parseFloat(val) || 0;
    if(v < 0) v = 0;
    window.ordenCompraActual[idx].pedir = v;
    window.renderModalOrdenCompra();
};

window.cerrarModalOrden = () => {
    document.getElementById('modalOrdenCompra').classList.add('hidden');
};

window.imprimirOrdenCompra = () => {
    const z = document.getElementById('zonaSelect').value;
    const u = localStorage.getItem('currentUser');
    const e = localStorage.getItem('empresaId'); // Nombre del negocio
    const ts = Date.now();
    const f = new Date(ts).toLocaleString('es-MX');

    let tkF = "";
    let totalCosto = 0;
    
    let filterPedir = window.ordenCompraActual.filter(p => p.pedir > 0); 

    if(filterPedir.length === 0) return alert("No hay productos con cantidad a pedir configurada. Modifica las celdas azules de 'Cant. a Pedir'.");

    filterPedir.forEach(p => {
        let subCosto = (p.costo || 0) * p.pedir;
        totalCosto += subCosto;
        tkF += `<tr>
            <td style="padding:4px 0; border-bottom:1px dashed #ccc; font-size:10px;">${p.sku}</td>
            <td style="padding:4px 0; border-bottom:1px dashed #ccc; font-size:10px;">${p.nombre.substring(0,20)}</td>
            <td style="padding:4px 0; border-bottom:1px dashed #ccc; font-size:10px;">${p.proveedor || '--'}</td>
            <td style="padding:4px 0; border-bottom:1px dashed #ccc; text-align:center; font-size:10px; font-weight:bold;">${p.pedir}</td>
            <td style="padding:4px 0; border-bottom:1px dashed #ccc; font-size:10px; text-align:right;">$${(p.costo || 0).toFixed(2)}</td>
            <td style="padding:4px 0; border-bottom:1px dashed #ccc; font-size:10px; text-align:right;">$${subCosto.toFixed(2)}</td>
        </tr>`;
    });

    // REEMPLAZAMOS EL TÍTULO y cambiamos "Generó" por "Usuario"
    const htmlTk = `<html><head><title>${e}</title><style>body{font-family:'Courier New',monospace;font-size:12px;margin:0;padding:10px;width:80mm;}h2,p{margin:2px 0;text-align:center;}table{width:100%;border-collapse:collapse;margin-top:10px;}th{border-bottom:1px dashed black;text-align:left;font-size:11px;}</style></head><body>
        <h2>${e}</h2>
        <p style="font-weight:bold; font-size:14px; margin: 4px 0;">ORDEN DE COMPRA</p>
        <p>Sucursal: ${z}</p>
        <p>Fecha: ${f}</p>
        <p>Usuario: ${u}</p>
        <table>
            <thead><tr><th>SKU</th><th>Prod</th><th>Prov</th><th style="text-align:center;">Pedir</th><th style="text-align:right;">Costo</th><th style="text-align:right;">Sub</th></tr></thead>
            <tbody>${tkF}</tbody>
        </table>
        <h3 style="text-align:right; margin-top:10px;">TOTAL EST.: $${totalCosto.toFixed(2)}</h3>
        <p style="margin-top:20px; border-top:1px dashed black; padding-top:5px; text-align:center;">Firma de Autorización</p>
        </body></html>`;

    let ifr = document.getElementById('iframeImpresion');
    if(!ifr) {
        ifr = document.createElement('iframe');
        ifr.id = 'iframeImpresion';
        ifr.style.display = 'none';
        document.body.appendChild(ifr);
    }

    ifr.contentWindow.document.open();
    ifr.contentWindow.document.write(htmlTk);
    ifr.contentWindow.document.close();

    setTimeout(() => {
        ifr.contentWindow.focus();
        ifr.contentWindow.print();
        window.cerrarModalOrden();
        window.mostrarNotificacion("🖨️ Orden impresa correctamente");
    }, 500);
};
// ----------------------------------------------

window.guardarProveedor = async () => {
    const nom = document.getElementById('prov_nombre').value.trim();
    const tel = document.getElementById('prov_tel').value.trim();
    const not = document.getElementById('prov_notas').value.trim();
    const e = localStorage.getItem('empresaId');
    
    let dias = [];
    document.querySelectorAll('.prov_dia:checked').forEach(c => dias.push(c.value));
    
    if(!nom) return alert("Nombre obligatorio.");
    try {
        const id = nom.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        await setDoc(doc(db, `${e}_Proveedores`, id), { id, nombre: nom, telefono: tel, dias: dias, notas: not, timestamp: Date.now() });
        window.mostrarNotificacion("✅ Proveedor guardado");
        document.getElementById('prov_nombre').value = ''; document.getElementById('prov_tel').value = ''; document.getElementById('prov_notas').value = '';
        document.querySelectorAll('.prov_dia').forEach(c => c.checked = false);
        window.cargarProveedores();
    } catch(er) { alert("Error al guardar proveedor."); }
};

window.cargarProveedores = async () => {
    const e = localStorage.getItem('empresaId'); const tb = document.getElementById('tablaProveedoresBody');
    tb.innerHTML = "<tr><td colspan='4' class='text-center p-8'>Cargando...</td></tr>"; 
    let h = "";
    let opts = '<option value="">Seleccionar Proveedor...</option>'; 

    try {
        const sn = await getDocs(collection(db, `${e}_Proveedores`));
        sn.forEach(d => {
            const pr = d.data();
            const diasStr = pr.dias.length > 0 ? pr.dias.join(', ') : 'Llamada previa';
            h += `<tr class="border-b"><td class="p-3"><span class="font-bold text-teal-700 block">${pr.nombre}</span><span class="text-xs text-gray-500">📞 ${pr.telefono||'Sin Tel'}</span></td><td class="p-3 text-sm font-bold">${diasStr}</td><td class="p-3 text-xs text-gray-600 whitespace-pre-wrap">${pr.notas}</td><td class="p-3"><button onclick="eliminarProveedor('${pr.id}')" class="text-red-500 hover:bg-red-50 px-2 py-1 rounded transition">🗑️</button></td></tr>`;
            opts += `<option value="${pr.nombre}">${pr.nombre}</option>`;
        }); 
        tb.innerHTML = h || "<tr><td colspan='4' class='text-center p-8'>Sin proveedores registrados</td></tr>";
        
        const p_prov = document.getElementById('p_prov');
        const edit_prov = document.getElementById('edit_prov');
        if (p_prov) p_prov.innerHTML = opts;
        if (edit_prov) edit_prov.innerHTML = opts;

    } catch (er) { tb.innerHTML = "<tr><td colspan='4' class='text-center p-8 text-red-500'>Error</td></tr>"; }
};

window.eliminarProveedor = async (id) => {
    if(!confirm("¿Borrar este proveedor?")) return;
    const e = localStorage.getItem('empresaId');
    try { await deleteDoc(doc(db, `${e}_Proveedores`, id)); window.cargarProveedores(); } catch(er) { alert("Error."); }
};

// 9. EDICIÓN, REGISTRO Y CARGA MASIVA
window.guardarProducto = async () => {
    const sku = document.getElementById('p_sku').value.trim(); 
    const nom = document.getElementById('p_nom').value.trim(); 
    const cat = document.getElementById('p_cat').value.trim() || "General";
    const prov = document.getElementById('p_prov')?.value || ""; 
    const cos = parseFloat(document.getElementById('p_cos').value) || 0; 
    const pre = parseFloat(document.getElementById('p_pre').value) || 0; 
    const pMay = parseFloat(document.getElementById('p_mayoreo').value) || 0; 
    const cMay = parseFloat(document.getElementById('p_cant_mayoreo').value) || 0; 
    const stk = parseFloat(document.getElementById('p_stk').value) || 0; 
    const minS = parseFloat(document.getElementById('p_min').value) || 0; 
    const maxS = parseFloat(document.getElementById('p_max').value) || 0;
    const isGranel = document.getElementById('p_granel').checked; 
    const cad = document.getElementById('p_caducidad').value || null;

    const z = document.getElementById('zonaSelect').value; 
    const e = localStorage.getItem('empresaId'); 
    const u = localStorage.getItem('currentUser'); 
    const ts = Date.now(); 
    const f = new Date(ts).toLocaleString('es-MX');
    
    if(!sku || !nom) return alert("SKU y Nombre obligatorios.");
    
    try {
        const r = `${e}_Inventario_${z}`; 
        const d = await getDoc(doc(db, r, sku)); 
        let sF = stk; if (d.exists()) sF += d.data().stock;
        
        await setDoc(doc(db, r, sku), { sku, nombre: nom, categoria: cat, proveedor: prov, costo: cos, precio: pre, precio_mayoreo: pMay, cant_mayoreo: cMay, es_granel: isGranel, stock: sF, min_stk: minS, max_stk: maxS, caducidad: cad, zona: z, precio_promo: 0 }, { merge: true }); 
        await addDoc(collection(db, `${e}_Historial_Ingresos`), { sku, nombre: nom, cantidad: stk, zona: z, usuario: u, fechaRegistro: f, timestamp: ts, tipoMovimiento: "ENTRADA" });
        
        window.mostrarNotificacion("📦 Producto ingresado correctamente"); 
        ['p_sku','p_nom','p_cat','p_cos','p_pre','p_mayoreo','p_cant_mayoreo','p_stk','p_min','p_max','p_caducidad'].forEach(id => document.getElementById(id).value = ''); 
        if(document.getElementById('p_prov')) document.getElementById('p_prov').value = '';
        document.getElementById('p_granel').checked = false; 
        window.cargarInventarioGeneral();
    } catch (err) { alert("Error al guardar producto."); }
};

window.abrirModalEdicion = (sku) => { 
    const p = window.inventarioLocal.find(x => x.sku === sku); if(!p) return;
    document.getElementById('edit_sku').value = p.sku; 
    document.getElementById('edit_nom').value = p.nombre; 
    document.getElementById('edit_cat').value = p.categoria || "General";
    
    if(document.getElementById('edit_prov')) document.getElementById('edit_prov').value = p.proveedor || "";
    
    document.getElementById('edit_cos').value = p.costo||0; 
    document.getElementById('edit_pre').value = p.precio||0; 
    document.getElementById('edit_promo').value = p.precio_promo || 0; 
    document.getElementById('edit_mayoreo').value = p.precio_mayoreo || 0; 
    document.getElementById('edit_cant_mayoreo').value = p.cant_mayoreo || 0; 
    document.getElementById('edit_stk').value = p.stock||0; 
    document.getElementById('edit_min').value = p.min_stk || 0; 
    document.getElementById('edit_max').value = p.max_stk || 0;
    document.getElementById('edit_granel').checked = p.es_granel || false; 
    document.getElementById('edit_caducidad').value = p.caducidad || "";
    document.getElementById('modalEdicion').classList.remove('hidden'); 
};

window.cerrarModalEdicion = () => { document.getElementById('modalEdicion').classList.add('hidden'); };

window.guardarEdicionProducto = async () => {
    const sku = document.getElementById('edit_sku').value; 
    const nom = document.getElementById('edit_nom').value.trim(); 
    const cat = document.getElementById('edit_cat').value.trim() || "General"; 
    const prov = document.getElementById('edit_prov')?.value || ""; 
    const cos = parseFloat(document.getElementById('edit_cos').value) || 0; 
    const pre = parseFloat(document.getElementById('edit_pre').value) || 0; 
    const promo = parseFloat(document.getElementById('edit_promo').value) || 0; 
    const pMay = parseFloat(document.getElementById('edit_mayoreo').value) || 0; 
    const cMay = parseFloat(document.getElementById('edit_cant_mayoreo').value) || 0; 
    const stk = parseFloat(document.getElementById('edit_stk').value) || 0; 
    const minS = parseFloat(document.getElementById('edit_min').value) || 0; 
    const maxS = parseFloat(document.getElementById('edit_max').value) || 0;
    const isGranel = document.getElementById('edit_granel').checked; 
    const cad = document.getElementById('edit_caducidad').value || null;

    if(!nom) return alert("El nombre es obligatorio.");
    
    const z = document.getElementById('zonaSelect').value; 
    const e = localStorage.getItem('empresaId'); 
    const u = localStorage.getItem('currentUser'); 
    const ts = Date.now(); 
    const f = new Date(ts).toLocaleString('es-MX');
    
    try {
        let updates = { nombre: nom, categoria: cat, proveedor: prov, costo: cos, precio: pre, precio_promo: promo, precio_mayoreo: pMay, cant_mayoreo: cMay, es_granel: isGranel, stock: stk, min_stk: minS, max_stk: maxS, caducidad: cad };                
        await setDoc(doc(db, `${e}_Inventario_${z}`, sku), updates, { merge: true });
        await addDoc(collection(db, `${e}_Historial_Ingresos`), { sku, nombre: nom, cantidad: stk, zona: z, usuario: u, fechaRegistro: f, timestamp: ts, tipoMovimiento: "AJUSTE" });
        
        window.mostrarNotificacion("✅ Producto actualizado"); 
        window.cerrarModalEdicion(); 
        window.cargarInventarioGeneral();
    } catch(err) { alert("Error al editar."); }
};

window.procesarArchivoMasivo = function() {
    const i = document.getElementById('archivoInventario'); 
    const s = document.getElementById('statusCargaMasiva'); 
    const z = document.getElementById('zonaSelect').value; 
    const e = localStorage.getItem('empresaId'); 
    const u = localStorage.getItem('currentUser');
    
    if (!i.files || i.files.length === 0) return; 
    const a = i.files[0]; const l = new FileReader();
    s.classList.remove('hidden'); s.className = "mt-4 p-4 bg-blue-50 text-blue-700 rounded-lg font-bold"; s.innerText = "⏳ Sincronizando...";
    
    l.onload = async function(ev) {
        const c = ev.target.result; let pr = 0; const ts = Date.now(); const f = new Date(ts).toLocaleString('es-MX');
        try {
            let batch = writeBatch(db); let opCount = 0; 
            const commitBatch = async () => { if(opCount > 0) { await batch.commit(); batch = writeBatch(db); opCount = 0; } };
            
            const procesarItem = async (sku, nom, stk, cos, pre) => {
                batch.set(doc(db, `${e}_Inventario_${z}`, sku), { sku, nombre: nom, costo: cos, precio: pre, stock: stk, zona: z, categoria: "General", proveedor: "", min_stk: 0, max_stk: 0, precio_promo: 0, precio_mayoreo: 0, cant_mayoreo: 0, es_granel: false, caducidad: null }, {merge:true}); opCount++;
                if(stk > 0) { batch.set(doc(collection(db, `${e}_Historial_Ingresos`)), { sku, nombre: nom, cantidad: stk, zona: z, usuario: u, fechaRegistro: f, timestamp: ts, tipoMovimiento: "ENTRADA" }); opCount++; }
                if(opCount > 400) await commitBatch();
            };
            
            if (a.name.endsWith('.xml')) {
                const xm = new DOMParser().parseFromString(c, "text/xml"); const it = xm.getElementsByTagName("item");
                for (let j = 0; j < it.length; j++) {
                    const item = it[j]; const sku = item.getElementsByTagName("value0")[0]?.textContent?.trim() || ""; if (!sku) continue;
                    const nom = item.getElementsByTagName("value1")[0]?.textContent?.trim() || ""; const stk = parseFloat(item.getElementsByTagName("value2")[0]?.textContent?.trim() || "0"); const nC = item.getElementsByTagName("value3")[0]?.textContent?.trim() || ""; 
                    let cos = 0; let pre = 0; if(nC) { const p = nC.split('?'); const eN = (str) => { const m = str.match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0; }; cos = eN(p[0]); pre = p.length > 1 ? eN(p[1]) : cos; if (pre === 0) pre = cos; }
                    await procesarItem(sku, nom, stk, cos, pre); pr++;
                }
            } else if (a.name.endsWith('.txt')) { 
                const ln = c.split('\n'); 
                for (let li of ln) { 
                    const col = li.trim().split(','); 
                    if (col.length >= 5 && col[0].trim()) { await procesarItem(col[0].trim(), col[1].trim(), parseFloat(col[4])||0, parseFloat(col[2])||0, parseFloat(col[3])||0); pr++; } 
                } 
            }
            await commitBatch(); 
            s.className = "mt-4 p-4 bg-green-50 text-green-700 rounded-lg font-bold"; 
            s.innerText = `✅ Carga Exitosa! ${pr} productos cargados.`; 
            window.cargarInventarioGeneral();
        } catch (er) { 
            s.className = "mt-4 p-4 bg-red-50 text-red-700 rounded-lg"; s.innerText = "❌ Error en archivo."; 
        }
    }; 
    l.readAsText(a);
};

window.vaciarInventario = async () => { 
    const z = document.getElementById('zonaSelect').value; 
    const p = prompt(`Precaución. Escribe VACIAR para borrar toda la zona ${z}:`); 
    if(p !== 'VACIAR') return; 
    try { 
        const sn = await getDocs(collection(db, `${localStorage.getItem('empresaId')}_Inventario_${z}`)); 
        sn.forEach(async (d) => { await deleteDoc(doc(db, `${localStorage.getItem('empresaId')}_Inventario_${z}`, d.id)); }); 
        alert("Inventario borrado con éxito."); 
        window.cargarInventarioGeneral(); 
    } catch(e) { alert("Error al borrar inventario."); } 
};

// 10. REPORTES Y KARDEX
window.generarReporte = async () => {
    const z = document.getElementById('zonaSelect').value; const e = localStorage.getItem('empresaId'); 
    const fIniStr = document.getElementById('rep_inicio').value; const fFinStr = document.getElementById('rep_fin').value; const fCat = document.getElementById('rep_cat').value;
    
    if(!fIniStr || !fFinStr) return alert("Selecciona fechas para generar el reporte.");
    
    const tInicio = new Date(fIniStr + "T00:00:00").getTime(); 
    const tFin = new Date(fFinStr + "T23:59:59").getTime();
    const tb = document.getElementById('tablaReportesBody'); 
    tb.innerHTML = "<tr><td colspan='6' class='p-8 text-center'>Procesando ventas...</td></tr>"; 
    
    let totalDinero = 0; let cantVentas = 0; let cantTickets = 0; let h = ""; 
    window.datosReporteCSV = [["Fecha", "Vendedor", "SKU", "Producto", "Categoria", "Cantidad", "Total_Venta"]]; 
    
    try {
        const qVentas = query(collection(db, `${e}_Historial_Ventas`), where("zona", "==", z)); 
        const vSn = await getDocs(qVentas); let ventasPeriodo = [];
        vSn.forEach(d => { 
            const v = d.data(); 
            if(v.timestamp >= tInicio && v.timestamp <= tFin) { 
                if(fCat === 'Todas' || v.categoria === fCat) { 
                    ventasPeriodo.push(v); totalDinero += (v.precioVenta * v.cantidad); cantVentas += v.cantidad; 
                } 
            }
        });
        
        const ticketsUnicos = new Set(ventasPeriodo.map(v => v.timestamp)); cantTickets = ticketsUnicos.size;
        const tkPromedio = cantTickets > 0 ? (totalDinero / cantTickets) : 0;

        document.getElementById('rep_total_vendido').innerText = `$${totalDinero.toLocaleString('es-MX', {minimumFractionDigits: 2})}`; 
        document.getElementById('rep_piezas_vendidas').innerText = cantVentas.toLocaleString(); 
        document.getElementById('rep_ticket_promedio').innerText = `$${tkPromedio.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
        
        ventasPeriodo.sort((a,b) => b.timestamp - a.timestamp);
        ventasPeriodo.forEach(v => {
            const sub = v.precioVenta * v.cantidad; const cV = v.cantidad % 1 !== 0 ? v.cantidad.toFixed(3) : v.cantidad;
            h += `<tr class="border-b"><td class="p-3 text-xs text-gray-500">${v.fechaRegistro}</td><td class="p-3 font-bold">${v.nombre}</td><td class="p-3 text-xs">${v.categoria||'Gen'}</td><td class="p-3 text-center">${cV}</td><td class="p-3 text-indigo-600">${v.usuario}</td><td class="p-3 text-right text-green-600 font-bold">$${sub.toFixed(2)}</td></tr>`;
            window.datosReporteCSV.push([v.fechaRegistro, v.usuario, v.sku, v.nombre, v.categoria, v.cantidad, sub.toFixed(2)]);
        }); 
        tb.innerHTML = h || "<tr><td colspan='6' class='p-8 text-center'>Sin ventas en este rango de fechas</td></tr>";
    } catch (err) { tb.innerHTML = `<tr><td colspan='6' class='text-red-500 text-center p-8'>Error al generar reporte</td></tr>`; }
};

window.descargarCSV = () => { 
    if(window.datosReporteCSV.length <= 1) return alert("Genera el reporte primero."); 
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; 
    window.datosReporteCSV.forEach(function(rowArray) { let row = rowArray.map(item => `"${item}"`).join(","); csvContent += row + "\r\n"; });
    const link = document.createElement("a"); link.setAttribute("href", encodeURI(csvContent)); link.setAttribute("download", `Reporte.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
};

window.cargarKardex = async (tipo = 'entradas') => {
    window.kardexActual = tipo; 
    document.getElementById('btn-kardex-entradas').className = tipo === 'entradas' ? 'px-4 py-2 font-bold text-green-600 border-b-4 border-green-600 transition' : 'px-4 py-2 font-bold text-gray-400 hover:text-red-500 border-b-4 border-transparent transition';
    document.getElementById('btn-kardex-salidas').className = tipo === 'salidas' ? 'px-4 py-2 font-bold text-red-600 border-b-4 border-red-600 transition' : 'px-4 py-2 font-bold text-gray-400 hover:text-red-500 border-b-4 border-transparent transition';
    
    const z = document.getElementById('zonaSelect').value; const e = localStorage.getItem('empresaId'); 
    const tb = document.getElementById('tablaKardexBody'); tb.innerHTML = "<tr><td colspan='6' class='p-8 text-center'>Consultando base de datos...</td></tr>"; 
    let movs = [];
    
    try {
        if (tipo === 'entradas') { 
            const qIngresos = query(collection(db, `${e}_Historial_Ingresos`), where("zona", "==", z)); 
            const iSn = await getDocs(qIngresos); 
            iSn.forEach(d => { movs.push({...d.data(), tipo: d.data().tipoMovimiento || 'ENTRADA'}); }); 
        } else { 
            const qVentas = query(collection(db, `${e}_Historial_Ventas`), where("zona", "==", z)); 
            const vSn = await getDocs(qVentas); 
            vSn.forEach(d => { movs.push({...d.data(), tipo: 'SALIDA'}); }); 
        }
        
        movs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); 
        const movsRecientes = movs.slice(0, 100); let h = "";
        
        movsRecientes.forEach(m => {
            let bc = 'bg-gray-100 text-gray-700'; let ic = '⚙️'; 
            if(m.tipo === 'ENTRADA') { bc = 'bg-green-100 text-green-700'; ic = '📦'; } 
            if(m.tipo === 'SALIDA') { bc = 'bg-red-100 text-red-700'; ic = '🛍️'; } 
            if(m.tipo === 'AJUSTE') { bc = 'bg-orange-100 text-orange-700'; ic = '✏️'; }
            if(m.tipo === 'ELIMINACIÓN') { bc = 'bg-red-800 text-white'; ic = '🗑️'; }
            
            const cV = m.cantidad % 1 !== 0 ? parseFloat(m.cantidad).toFixed(3) : m.cantidad;
            h += `<tr class="border-b"><td class="p-3 text-xs text-gray-500">${m.fechaRegistro}</td><td class="p-3"><span class="px-3 py-1 rounded text-xs font-bold ${bc}">${ic} ${m.tipo}</span></td><td class="p-3 font-mono text-xs">${m.sku}</td><td class="p-3 font-medium">${m.nombre}</td><td class="p-3 text-center font-bold">${cV}</td><td class="p-3 text-gray-600">${m.usuario}</td></tr>`;
        }); 
        tb.innerHTML = h || `<tr><td colspan='6' class='text-center p-8'>No hay movimientos registrados.</td></tr>`;
    } catch (err) { tb.innerHTML = `<tr><td colspan='6' class='text-red-500 text-center p-8'>Error al consultar Kardex</td></tr>`; }
};

// 11. USUARIOS Y ZONAS
window.crearUsuarioSecundario = async () => { 
    const u = document.getElementById('new_user').value.trim(); 
    const em = document.getElementById('new_email').value.trim().toLowerCase(); 
    const p = document.getElementById('new_pass').value.trim(); 
    const r = document.getElementById('new_role').value; 
    const emp = localStorage.getItem('empresaId'); 
    const zn = JSON.parse(localStorage.getItem('zonas') || "[]"); 
    
    if(!u || !p || !em) return alert("Llena todos los datos"); 
    
    try { 
        const cred = await createUserWithEmailAndPassword(secondaryAuth, em, p); 
        const uid = cred.user.uid;
        await secondaryAuth.signOut(); 
        
        await setDoc(doc(db, "SaaS_Directorio", u), { email: em, uid: uid }); 
        await setDoc(doc(db, "SaaS_Usuarios", uid), { empresaId: emp, rol: r, zonas: zn, usuario: u }); 
        
        alert(`✅ Usuario creado con éxito.`); 
        ['new_user', 'new_email', 'new_pass'].forEach(id => document.getElementById(id).value = ''); 
        window.cargarUsuarios(); 
    } catch(er) { alert("Error al crear usuario: " + er.message); } 
};
window.cargarUsuarios = async () => { 
    const e = localStorage.getItem('empresaId'); 
    const tb = document.getElementById('tablaUsuariosBody'); 
    tb.innerHTML = '<tr><td colspan="3" class="text-center p-8">Cargando...</td></tr>'; 
    
    try { 
        const q = query(collection(db, "SaaS_Usuarios"), where("empresaId", "==", e)); 
        const sn = await getDocs(q); let h = ''; 
        sn.forEach(d => { 
            const u = d.data(); 
            h += `<tr class="border-b hover:bg-blue-50 transition"><td class="p-3 font-bold">${u.usuario || d.id}</td><td class="p-3 font-bold ${u.rol==='Dueño'?'text-blue-600':'text-green-600'}">${u.rol}</td><td class="p-3 text-gray-500">${u.zonas.join(', ')}</td></tr>`; 
        }); 
        tb.innerHTML = h || '<tr><td colspan="3" class="text-center p-8">Sin usuarios registrados</td></tr>'; 
    } catch(er) { tb.innerHTML = `<tr><td colspan="3" class="text-center text-red-500 p-8">Error al cargar equipo</td></tr>`; } 
};

window.agregarNuevaZona = async () => { 
    const nZ = prompt("Escribe el nombre exacto de la nueva zona:"); 
    if(nZ) { 
        const u = localStorage.getItem('currentUser'); 
        const z = JSON.parse(localStorage.getItem('zonas') || "[]"); 
        
        if(!z.includes(nZ)) { 
            z.push(nZ); 
            await setDoc(doc(db, "SaaS_Usuarios", u), { zonas: z }, { merge: true }); 
            localStorage.setItem('zonas', JSON.stringify(z)); 
            alert("Zona agregada correctamente. La página se actualizará.");
            location.reload();
        } else {
            alert("Esa zona ya existe en tu registro.");
        }
    } 
};

// 12. INICIO AUTOMÁTICO
if(localStorage.getItem('currentUser')) {
    iniciarApp();
}
// ==========================================
// REGISTRO RÁPIDO EN PUNTO DE VENTA
// ==========================================
window.abrirModalRegistroRapido = () => {
    const busquedaActual = document.getElementById('venta_busqueda').value;
    
    document.getElementById('rr_sku').value = busquedaActual.trim();
    document.getElementById('rr_nombre').value = '';
    document.getElementById('rr_costo').value = '';
    document.getElementById('rr_precio').value = '';
    
    document.getElementById('modal-registro-rapido').classList.remove('hidden');
    
    if(busquedaActual !== "") {
        document.getElementById('rr_nombre').focus();
    } else {
        document.getElementById('rr_sku').focus();
    }
};

window.cerrarModalRegistroRapido = () => {
    document.getElementById('modal-registro-rapido').classList.add('hidden');
    document.getElementById('venta_busqueda').focus(); 
};

window.guardarRegistroRapido = async () => {
    const sku = document.getElementById('rr_sku').value.trim();
    const nom = document.getElementById('rr_nombre').value.trim().toUpperCase();
    const cos = parseFloat(document.getElementById('rr_costo').value) || 0;
    const pre = parseFloat(document.getElementById('rr_precio').value) || 0;

    if (!sku || !nom || pre <= 0) {
        return alert('Por favor, ingresa SKU, Nombre y un Precio de Venta válido (mayor a 0).');
    }

    const z = document.getElementById('zonaSelect').value; 
    const e = localStorage.getItem('empresaId'); 
    const u = localStorage.getItem('currentUser'); 
    const ts = Date.now(); 
    const f = new Date(ts).toLocaleString('es-MX');

    // Deshabilitar botón mientras guarda para evitar duplicados
    const btn = document.querySelector('#modal-registro-rapido button[onclick="guardarRegistroRapido()"]');
    const btnOriginalText = btn.innerHTML;
    btn.innerHTML = '⏳ Guardando...';
    btn.disabled = true;

    try {
        // 1. Crear el objeto del producto con tu estructura exacta
        const nuevoProducto = { 
            sku: sku, 
            nombre: nom, 
            categoria: "General", 
            proveedor: "", 
            costo: cos, 
            precio: pre, 
            precio_mayoreo: 0, 
            cant_mayoreo: 0, 
            es_granel: false, 
            stock: 0, // Entra con stock 0 en la BD
            min_stk: 0, 
            max_stk: 0, 
            caducidad: null, 
            zona: z, 
            precio_promo: 0 
        };

        // 2. Guardar en Firebase (En el inventario y en el Kardex)
        const r = `${e}_Inventario_${z}`; 
        await setDoc(doc(db, r, sku), nuevoProducto, { merge: true }); 
        await addDoc(collection(db, `${e}_Historial_Ingresos`), { 
            sku: sku, nombre: nom, cantidad: 0, zona: z, usuario: u, fechaRegistro: f, timestamp: ts, tipoMovimiento: "ENTRADA_EXPRESS" 
        });

        // 3. Agregarlo a la memoria local para que el buscador lo reconozca después
        window.inventarioLocal.push(nuevoProducto);

        // 4. Cerrar la ventana y limpiar el buscador
        window.cerrarModalRegistroRapido();
        document.getElementById('venta_busqueda').value = '';
        
        // 5. Agregar al carrito inmediatamente. 
        // Le ponemos un stock virtual alto solo para pasar el candado de tu carrito.
        // Al cobrar, Firebase hará la resta correcta (0 - 1 = -1), lo cual es normal en punto de venta.
        const productoParaCarrito = { ...nuevoProducto, stock: 9999 };
        window.agregarAlCarrito(productoParaCarrito);
        
        window.mostrarNotificacion('✅ Producto express guardado y listo para cobro.');
        
    } catch (error) {
        console.error(error);
        alert('Hubo un error al registrar el producto en la base de datos.');
    } finally {
        btn.innerHTML = btnOriginalText;
        btn.disabled = false;
    }
};