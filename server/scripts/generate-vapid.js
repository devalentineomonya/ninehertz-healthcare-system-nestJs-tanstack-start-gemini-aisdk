import webpush from 'web-push';

console.log('🔑 Generating new VAPID keys...\n');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('📋 Your new VAPID keys:');
console.log('========================');
console.log('');
console.log('Public Key (for frontend):');
console.log(vapidKeys.publicKey);
console.log('');
console.log('Private Key (for backend):');
console.log(vapidKeys.privateKey);
console.log('');
console.log('📝 Add these to your environment variables:');
console.log('===========================================');
console.log('');
console.log('Backend (.env):');
console.log(`VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
console.log(`VAPID_EMAIL="your-email@example.com"`);
console.log('');
console.log('Frontend (.env):');
console.log(`VITE_VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
console.log('');
console.log(
  '⚠️  Make sure to update both frontend and backend with these keys!',
);
console.log(
  '⚠️  Users will need to re-subscribe to push notifications after this change.',
);
