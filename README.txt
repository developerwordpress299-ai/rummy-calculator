RUMMY COUNTER — cPanel upload guide
===================================
1) Is poore folder ki files public_html (ya kisi subfolder jaise public_html/rummy) mein upload karo:
     index.html
     css/style.css
     js/app.js  js/cloud.js  js/config.js
   (ya zip upload karke cPanel File Manager mein "Extract" kar do)
2) Browser mein domain kholo — bas. Koi build / npm / install nahi chahiye.

ONLINE ROOMS (OPTIONAL)
-----------------------
Agar sirf ek device par use karna hai to kuch karne ki zaroorat nahi — scores browser mein save hote hain.
Multi-phone live sync chahiye to:
 a) console.firebase.google.com par project banao -> Add Web App -> config copy karo
 b) js/config.js mein apni keys paste karo
 c) Authentication -> Sign-in method -> "Anonymous" enable karo
 d) Authentication -> Settings -> Authorized domains mein apna domain add karo
 e) Firestore Database banao -> Rules mein yeh paste karke Publish karo:

    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /rooms/{code} {
          allow read: if request.auth != null;
          allow create: if request.auth != null && request.resource.data.hostUid == request.auth.uid;
          allow update, delete: if request.auth != null && resource.data.hostUid == request.auth.uid;
        }
      }
    }
