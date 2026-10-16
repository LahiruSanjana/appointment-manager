const router = require('express').Router();
const { z } = require('zod');
const User = require('../models/User');
const { auth, requireRole } = require('../middleware/auth');

const roleSchema = z.object({ role: z.enum(['patient', 'doctor', 'admin']) }).strict();
const publicUser = (user) => ({ id: user._id, name: user.name, email: user.email, role: user.role });

router.use(auth, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    const users = await User.find().select('name email role').sort({ name: 1 });
    res.json(users.map(publicUser));
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/role', async (req, res, next) => {
  try {
    const { role } = roleSchema.parse(req.body);
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (String(user._id) === String(req.user.id))
      return res.status(400).json({ error: 'You cannot change your own role' });

    if (user.role === 'admin' && role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1)
        return res.status(400).json({ error: 'At least one administrator is required' });
    }

    user.role = role;
    await user.save();
    res.json({ user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
