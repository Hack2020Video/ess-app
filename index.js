import firebase from 'firebase'
    var firebaseConfig = {
      "projectId": "huntington-video-349d9",
      "appId": "1:932847590550:web:de84bbf1a0356ef705b6b7",
      "databaseURL": "https://huntington-video-349d9.firebaseio.com",
      "storageBucket": "huntington-video-349d9.appspot.com",
      "locationId": "us-central",
      "apiKey": "AIzaSyCBJUVvMk-S0Ex0m_mPnhyGBXz6hvXzk8g",
      "authDomain": "huntington-video-349d9.firebaseapp.com",
      "messagingSenderId": "932847590550",
      "measurementId": "G-N6PXFG1QD4"
    };
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);



mdc.ripple.MDCRipple.attachTo(document.querySelector('.mdc-button'));

const configuration = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let roomDialog = null;
let roomId = null;

function init() {
  
  document.querySelector('#hangupBtn').addEventListener('click', hangUp);
  document.querySelector('#hangupBtn').style.visibility = 'hidden';
  roomDialog = new mdc.dialog.MDCDialog(document.querySelector('#room-dialog'));
  availablerooms();
 
}
//finding available rooms
 function  availablerooms(){
    const db = firebase.firestore();

     db.collection('waitingRooms').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          let data = change.doc.data();
          console.log(change.doc.status );
          var element = document.createElement("button");
          element.innerHTML="Join Room";
          element.id = change.doc.id;
          element.className = "mdc-button mdc-button--raised";
          console.log(element.id);
          element.onclick = async function() { // Note this is a function
          console.log('Before doc id');
            console.log(change.doc.id);
            roomId=change.doc.id;
            await joinRoomById(roomId);
            this.disabled=true;
          };
            var parentobj = document.getElementById("roomList");
            //Append the element in page (in span).  
            parentobj.appendChild(element);
        }
        if (change.type === 'removed') {
          document.getElementById(change.doc.id).remove();
        console.log(change.doc.id);
        console.log("Inside removed function");
          }
        });
    });


 }


async function joinRoomById(roomId) {
  openUserMedia();
  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log('Got room:', roomSnapshot.exists);
    document.querySelector('#hangupBtn').style.visibility = 'visible';


  if (roomSnapshot.exists) {
    console.log('Create PeerConnection with configuration: ', configuration);
    peerConnection = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners();
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Code for collecting ICE candidates below
    const calleeCandidatesCollection = roomRef.collection('calleeCandidates');
    peerConnection.addEventListener('icecandidate', event => {
      if (!event.candidate) {
        console.log('Got final candidate!');
        return;
      }
      console.log('Got candidate: ', event.candidate);
      calleeCandidatesCollection.add(event.candidate.toJSON());
    });
    // Code for collecting ICE candidates above

    peerConnection.addEventListener('track', event => {
      console.log('Got remote track:', event.streams[0]);
      event.streams[0].getTracks().forEach(track => {
        console.log('Add a track to the remoteStream:', track);
        remoteStream.addTrack(track);
      });
    });

    // Code for creating SDP answer below
    const offer = roomSnapshot.data().offer;
    console.log('Got offer:', offer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    console.log('Created answer:', answer);
    await peerConnection.setLocalDescription(answer);

    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
      'status': 'inProgress'
    };
    await roomRef.update(roomWithAnswer);
    // Code for creating SDP answer above

    // Listening for remote ICE candidates below
    roomRef.collection('callerCandidates').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          let data = change.doc.data();
          console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
          await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
    // Listening for remote ICE candidates above

      // Listen for Hangup
  db.collection('rooms').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      if (change.type === 'removed' && roomId === change.doc.id ){
        console.log('hang up');
             hangUp();
      }
     
    });
  });
  }
  //Removing call from waiting List (on joining)
  db.collection('waitingRooms').doc(roomId).delete();

}

async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia(
      {video: true, audio: true});
  document.querySelector('#localVideo').srcObject = stream;
  localStream = stream;
  remoteStream = new MediaStream();
  document.querySelector('#remoteVideo').srcObject = remoteStream;

  console.log('Stream:', document.querySelector('#localVideo').srcObject);
  document.querySelector('#hangupBtn').disabled = false;
}

async function hangUp(e) {
  const tracks = document.querySelector('#localVideo').srcObject.getTracks();
  tracks.forEach(track => {
    track.stop();
  });

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector('#localVideo').srcObject = null;
  document.querySelector('#remoteVideo').srcObject = null;
  document.querySelector('#hangupBtn').disabled = true;
  document.querySelector('#currentRoom').innerText = '';

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(roomId);
    const calleeCandidates = await roomRef.collection('calleeCandidates').get();
    calleeCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    const callerCandidates = await roomRef.collection('callerCandidates').get();
    callerCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    await roomRef.delete();
    // Delete waiting list on hangup
    await db.collection('waitingRooms').doc(roomId).delete();
  }

  document.location.reload(true);
}

function registerPeerConnectionListeners() {
  peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log(
        `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
  });

  peerConnection.addEventListener('connectionstatechange', () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
  });

  peerConnection.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(
        `ICE connection state change: ${peerConnection.iceConnectionState}`);
  });
}

init();