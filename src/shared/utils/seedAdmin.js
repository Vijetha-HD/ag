import Admin from '../../domains/laptops/auth/models/Admin.model.js';

const ADMIN_DATA = {
  name: 'Super Admin',
  email: 'admin@brightlaptop.com',
  password: 'admin123',
  role: 'ADMIN',
};

export const seedAdminOnStartup = async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const existingAdmin = await Admin.findOne({ email: ADMIN_DATA.email });

    if (!existingAdmin) {
      await Admin.create(ADMIN_DATA);
      console.log('🌱 Admin created successfully');
    } else {
      console.log('✅ Admin already exists');
    }

  } catch (error) {
    console.error('Admin seed failed:', error.message);
  }
};
