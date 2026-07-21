// Firebase project config (chess-online)
const firebaseConfig = {
    apiKey: "AIzaSyB1dCpWpoy6IgH-CI0LHLYKU2ZizVLzi4w",
    authDomain: "chess-online-f21ef.firebaseapp.com",
    databaseURL: "https://chess-online-f21ef-default-rtdb.firebaseio.com",
    projectId: "chess-online-f21ef",
    storageBucket: "chess-online-f21ef.firebasestorage.app",
    messagingSenderId: "384607797053",
    appId: "1:384607797053:web:85e5203fd80e3a3ae9cf54"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();