// 1. Importar las herramientas de Firebase
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; 

// 2. Tu configuración única de BOOMBOX
const firebaseConfig = {
            apiKey: "AIzaSyDXXqcuMvdYZdrwMkw95KwiJ_UD_CIyD8g",
            authDomain: "mi-negocio-d1931.firebaseapp.com",
            projectId: "mi-negocio-d1931",
            storageBucket: "mi-negocio-d1931.firebasestorage.app",
            messagingSenderId: "543739671500",
            appId: "1:543739671500:web:b6abfebbcd6494370f2369",
            measurementId: "G-EKFYTVXJ97"
};

// 3. Inicializar la conexión
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);