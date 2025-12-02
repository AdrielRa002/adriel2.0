// 1. CONFIGURACIÓN DE FIREBASE
// Rellena estos datos con los de tu proyecto en la consola de Firebase.
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "XXX",
  appId: "XXX"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// 2. UTILIDADES DE VISTA
function mostrarVista(idVista) {
  const vistas = document.querySelectorAll('.view');
  vistas.forEach(v => v.classList.remove('active'));
  const vista = document.getElementById(idVista);
  if (vista) vista.classList.add('active');
}

function setUserInfo(user) {
  const avatar = document.getElementById('userAvatar');
  const label = document.getElementById('userLabel');
  if (!user) {
    avatar.textContent = '--';
    label.textContent = 'Sesión invitado';
    return;
  }
  const nombre = user.displayName || user.email;
  avatar.textContent = nombre.substring(0, 2).toUpperCase();
  label.textContent = nombre;
}

// 3. ESTADO GLOBAL
let piezas = [];
let piezaActual = null;
let usuarioActual = null;

// 4. CARGAR PIEZAS DESDE FIRESTORE
function suscribirPiezas() {
  db.collection('parts')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      piezas = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      renderPiezas();
      if (piezaActual) {
        const encontrada = piezas.find(p => p.id === piezaActual.id);
        if (encontrada) mostrarDetalle(encontrada);
      }
    });
}

// 5. RENDERIZAR CATÁLOGO
function renderPiezas(filtroTexto = '') {
  const cardsContainer = document.getElementById('cardsContainer');
  const piecesCount = document.getElementById('piecesCount');
  const texto = filtroTexto.trim().toLowerCase();

  cardsContainer.innerHTML = '';

  const filtradas = piezas.filter(p =>
    (p.nombre || '').toLowerCase().includes(texto) ||
    (p.material || '').toLowerCase().includes(texto) ||
    (p.proceso || '').toLowerCase().includes(texto) ||
    (p.equipo || '').toLowerCase().includes(texto)
  );

  filtradas.forEach(pieza => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-thumb">
        <div class="card-thumb-shape"></div>
      </div>
      <div class="card-name">${pieza.nombre || 'Sin nombre'}</div>
      <div class="card-meta">Material: ${pieza.material || '-'}</div>
      <div class="card-meta">Proceso: ${pieza.proceso || '-'}</div>
      <div class="status-pill">Aprobada</div>
    `;
    card.addEventListener('click', () => mostrarDetalle(pieza));
    cardsContainer.appendChild(card);
  });

  piecesCount.textContent =
    filtradas.length + ' pieza' + (filtradas.length === 1 ? '' : 's');
}

// 6. DETALLE DE PIEZA
function mostrarDetalle(pieza) {
  piezaActual = pieza;

  document.getElementById('detailTitle').textContent = pieza.nombre || 'Pieza';
  document.getElementById('detailSubtitle').textContent =
    `Material ${pieza.material || '-'} · Proceso ${pieza.proceso || '-'}`;
  document.getElementById('detailNameSide').textContent = pieza.nombre || 'Pieza';
  document.getElementById('detailMetaSide').textContent =
    `Material: ${pieza.material || '-'} · Proceso: ${pieza.proceso || '-'}`;
  document.getElementById('detailDims').textContent = pieza.dimensiones || '–';
  document.getElementById('detailEquipo').textContent = pieza.equipo || '–';
  document.getElementById('detailUso').textContent = pieza.uso || '–';

  configurarBotonFormato('btnStl', pieza.formatos?.stl, 'stl');
  configurarBotonFormato('btnStep', pieza.formatos?.step, 'step');
  configurarBotonFormato('btnObj', pieza.formatos?.obj, 'obj');
  configurarBotonFormato('btnPdf', pieza.formatos?.pdf, 'pdf');
}

function configurarBotonFormato(idBoton, url, formato) {
  const boton = document.getElementById(idBoton);
  if (url) {
    boton.classList.remove('btn-disabled');
    boton.dataset.url = url;
    boton.dataset.format = formato;
  } else {
    boton.classList.add('btn-disabled');
    delete boton.dataset.url;
    delete boton.dataset.format;
  }
}

// 7. DESCARGAS + HISTORIAL
function registrarDescarga(formato, url) {
  if (!usuarioActual || !piezaActual) return;

  db.collection('downloads').add({
    userId: usuarioActual.uid,
    partId: piezaActual.id,
    partName: piezaActual.nombre || '',
    format: formato,
    url: url,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function suscribirHistorial() {
  const historyList = document.getElementById('historyList');
  if (!usuarioActual) {
    historyList.innerHTML = '<div class="section-text">Inicia sesión para ver tu historial.</div>';
    return;
  }

  db.collection('downloads')
    .where('userId', '==', usuarioActual.uid)
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      historyList.innerHTML = '';
      snapshot.forEach(doc => {
        const d = doc.data();
        const fecha = d.createdAt ? d.createdAt.toDate() : new Date();
        const fechaStr = fecha.toLocaleDateString() + ' · ' + fecha.toLocaleTimeString();
        const item = document.createElement('div');
        item.className = 'history-item';
        const claseBadge =
          d.format === 'stl' ? 'badge-stl' :
          d.format === 'step' ? 'badge-step' :
          d.format === 'obj' ? 'badge-obj' : 'badge-pdf';

        item.innerHTML = `
          <div class="history-badge ${claseBadge}">${d.format.toUpperCase()}</div>
          <div>
            <div><strong>${d.partName || 'Pieza'}</strong></div>
            <div class="history-meta">Formato ${d.format.toUpperCase()}</div>
          </div>
          <div class="history-date">${fechaStr}</div>
        `;
        historyList.appendChild(item);
      });

      if (!snapshot.size) {
        historyList.innerHTML = '<div class="section-text">Sin descargas registradas.</div>';
      }
    });
}

// 8. SUBIR PIEZA
async function subirPieza() {
  if (!usuarioActual) {
    document.getElementById('uploadStatus').textContent =
      'Debes iniciar sesión para subir piezas.';
    return;
  }

  const nombre = document.getElementById('upName').value.trim();
  const material = document.getElementById('upMaterial').value.trim();
  const proceso = document.getElementById('upProceso').value.trim();
  const equipo = document.getElementById('upEquipo').value.trim();
  const dims = document.getElementById('upDims').value.trim();
  const uso = document.getElementById('upUso').value.trim();
  const formato = document.getElementById('upFormat').value;
  const archivoInput = document.getElementById('upFile');
  const archivo = archivoInput.files[0];
  const status = document.getElementById('uploadStatus');

  if (!nombre || !archivo) {
    status.textContent = 'Nombre y archivo son obligatorios.';
    return;
  }

  try {
    status.textContent = 'Subiendo archivo...';

    const partDocRef = db.collection('parts').doc();
    const path = `parts/${partDocRef.id}/${archivo.name}`;
    const ref = storage.ref().child(path);

    await ref.put(archivo);
    const url = await ref.getDownloadURL();

    const formatos = {};
    formatos[formato] = url;

    await partDocRef.set({
      nombre,
      material,
      proceso,
      equipo,
      dimensiones: dims,
      uso,
      formatos,
      createdBy: usuarioActual.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    status.textContent = 'Pieza subida correctamente.';
    archivoInput.value = '';
  } catch (err) {
    console.error(err);
    status.textContent = 'Error al subir pieza: ' + err.message;
  }
}

// 9. PREFERENCIAS
async function guardarPreferencias() {
  if (!usuarioActual) return;
  const language = document.getElementById('prefLanguage').value;
  const chips = document.querySelectorAll('.chip');
  let formatoPref = 'stl';
  chips.forEach(chip => {
    if (chip.classList.contains('active')) {
      formatoPref = chip.dataset.format;
    }
  });

  await db.collection('users').doc(usuarioActual.uid).set({
    prefs: {
      language,
      preferredFormat: formatoPref
    }
  }, { merge: true });

  alert('Preferencias guardadas.');
}

function initChips() {
  const chips = document.querySelectorAll('.chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });
}

// 10. AUTENTICACIÓN
async function registrarUsuario() {
  const nombre = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass = document.getElementById('regPass').value;
  const status = document.getElementById('authStatus');
  status.textContent = '';

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: nombre });
    await db.collection('users').doc(cred.user.uid).set({
      name: nombre,
      email: email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    status.textContent = 'Cuenta creada correctamente.';
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
  }
}

async function loginUsuario() {
  const email = document.getElementById('logEmail').value.trim();
  const pass = document.getElementById('logPass').value;
  const status = document.getElementById('authStatus');
  status.textContent = '';

  try {
    await auth.signInWithEmailAndPassword(email, pass);
    status.textContent = 'Sesión iniciada.';
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
  }
}

// 11. INICIO Y EVENTOS
window.addEventListener('DOMContentLoaded', () => {
  // buscador
  document.getElementById('searchInput')
    .addEventListener('input', e => renderPiezas(e.target.value));

  // nav superior
  const navButtons = document.querySelectorAll('.nav button');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mostrarVista(btn.dataset.view);
    });
  });

  // botones descarga
  ['btnStl', 'btnStep', 'btnObj', 'btnPdf'].forEach(id => {
    const boton = document.getElementById(id);
    boton.addEventListener('click', () => {
      const url = boton.dataset.url;
      const formato = boton.dataset.format;
      if (!url) return;
      window.open(url, '_blank');
      if (formato) registrarDescarga(formato, url);
    });
  });

  // subir pieza
  document.getElementById('btnUpload').addEventListener('click', subirPieza);

  // preferencias
  document.getElementById('btnSavePrefs').addEventListener('click', guardarPreferencias);
  initChips();

  // registro / login / logout
  document.getElementById('btnRegister').addEventListener('click', registrarUsuario);
  document.getElementById('btnLogin').addEventListener('click', loginUsuario);
  document.getElementById('btnLogout').addEventListener('click', () => auth.signOut());

  // borrar historial (simple: solo visual, si quieres luego borramos en BD)
  document.getElementById('btnClearHistory').addEventListener('click', async () => {
    if (!usuarioActual) return;
    const snap = await db.collection('downloads').where('userId', '==', usuarioActual.uid).get();
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  });

  // cambios de sesión
  auth.onAuthStateChanged(user => {
    usuarioActual = user || null;
    setUserInfo(usuarioActual);
    if (usuarioActual) {
      suscribirPiezas();
      suscribirHistorial();
    } else {
      piezas = [];
      renderPiezas();
      document.getElementById('historyList').innerHTML =
        '<div class="section-text">Inicia sesión para ver tu historial.</div>';
    }
  });
});
