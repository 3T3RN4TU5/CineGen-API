// Usage: node scripts/createAdmin.js <email>
// Promotes an existing user to admin (register through the API first).
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';

const email = process.argv[2]?.toLowerCase();
if (!email) {
  console.error('Usage: npm run seed:admin -- <email>');
  process.exit(1);
}

await connectDB();
const user = await User.findOneAndUpdate({ email }, { role: 'admin' }, { returnDocument: 'after' });
console.error(user ? `✅ ${user.email} is now an admin` : `❌ No user with email ${email}`);
await disconnectDB();
process.exit(user ? 0 : 1);
