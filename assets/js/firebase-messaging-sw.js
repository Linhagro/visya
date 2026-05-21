// firebase-messaging-sw.js
// Service Worker dedicado do Firebase Cloud Messaging.
// Recebe push quando o APP esta FECHADO ou em background.

importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// âš ï¸ Preencha com os valores do seu projeto Firebase
firebase.initializeApp({
  apiKey:            "AIzaSyA-XIGvDzSfWkMe17JW0wdhhcWJJJPXdYM",
  authDomain:        "visya-app.firebaseapp.com",
  projectId:         "visya-app",
  storageBucket:     "visya-app.firebasestorage.app",
  messagingSenderId: "43942932363",
  appId:             "1:43942932363:web:29103ca5aac0a62355498e"
});

const messaging = firebase.messaging();

// Push em background -> mostra notificacao do sistema
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM-SW] Push em background:', payload);

  const titulo = (payload.notification && payload.notification.title) || 'APP Visya';
  const opcoes = {
    body:  (payload.notification && payload.notification.body) || '',
    icon:  '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-192.png',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    data: payload.data || {},
    tag:  payload.data && payload.data.pedidoId ? `pedido-${payload.data.pedidoId}` : 'visya'
  };

  return self.registration.showNotification(titulo, opcoes);
});

// Quando o usuario clica na notificacao -> abre o app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = (event.notification.data && event.notification.data.url) || '/assets/html/app.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Se o app ja esta aberto, foca nele
      for (const client of windowClients) {
        if (client.url.includes('/assets/html/app.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // Senao, abre nova janela
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

