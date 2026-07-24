const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// ==================== DATABASE SCHEMAS ====================

// Schema ya Watumiaji
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  subscribed: { type: Boolean, default: true }
});

// Schema ya Masomo
const lessonSchema = new mongoose.Schema({
  title: { type: String, required: true },
  bible_verse: { type: String, required: true },
  content: { type: String, required: true },
  daily_word: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Lesson = mongoose.model('Lesson', lessonSchema);

// ==================== EMAIL SETUP ====================

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ==================== MIDDLEWARE YA AUTHENTICATION ====================

const authenticateAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==================== ROUTES ====================

// 1. LOGIN - Admin (POST)
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, message: 'Login successful' });
});

// 2. REGISTER - Watumiaji (POST)
app.post('/api/users/register', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create new user
    const newUser = new User({ email });
    await newUser.save();

    // Send welcome email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Karibu kwenye Mosha Bible Lessons! 🙏',
      html: `
        <h2>Habari ${email}!</h2>
        <p>Asante kwa kuandikisha kwenye <strong>Mosha Bible Lessons</strong></p>
        <p>Sasa utapokea neno la kila siku mula kwenye bibilia!</p>
        <p>Kama unataka kughairi, jibu email hii tu.</p>
        <p style="color: #666; font-size: 12px;">Mungu akubariki! 🙏</p>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: 'Registration successful! Check your email.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// 3. GET - Wote masomo (GET)
app.get('/api/lessons', async (req, res) => {
  try {
    const lessons = await Lesson.find().sort({ createdAt: -1 });
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// 4. GET - Somo moja (GET)
app.get('/api/lessons/:id', async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    res.json(lesson);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

// 5. POST - Kutengeneza somo mpya (Admin only)
app.post('/api/lessons', authenticateAdmin, async (req, res) => {
  try {
    const { title, bible_verse, content, daily_word } = req.body;

    if (!title || !bible_verse || !content || !daily_word) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const newLesson = new Lesson({
      title,
      bible_verse,
      content,
      daily_word
    });

    await newLesson.save();

    // Send email to all subscribers
    const users = await User.find({ subscribed: true });
    
    for (let user of users) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: `📖 Neno la Kila Siku: ${title}`,
        html: `
          <h2>${title}</h2>
          <p><strong>Ayat:</strong> ${bible_verse}</p>
          <hr>
          <p>${content}</p>
          <hr>
          <h3>💭 Neno la Kila Siku:</h3>
          <p><em>"${daily_word}"</em></p>
          <p style="color: #666; font-size: 12px; margin-top: 20px;">Mungu akubariki! 🙏</p>
        `
      };

      await transporter.sendMail(mailOptions);
    }

    res.json({ message: 'Lesson created and emails sent!', lesson: newLesson });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create lesson' });
  }
});

// 6. UPDATE - Kubadilisha somo (Admin only)
app.put('/api/lessons/:id', authenticateAdmin, async (req, res) => {
  try {
    const { title, bible_verse, content, daily_word } = req.body;

    const lesson = await Lesson.findByIdAndUpdate(
      req.params.id,
      { title, bible_verse, content, daily_word, updatedAt: Date.now() },
      { new: true }
    );

    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    res.json({ message: 'Lesson updated!', lesson });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update lesson' });
  }
});

// 7. DELETE - Kufuta somo (Admin only)
app.delete('/api/lessons/:id', authenticateAdmin, async (req, res) => {
  try {
    const lesson = await Lesson.findByIdAndDelete(req.params.id);

    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    res.json({ message: 'Lesson deleted!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
});

// 8. GET - Idadi ya watumiaji
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalLessons = await Lesson.countDocuments();
    const subscribedUsers = await User.countDocuments({ subscribed: true });

    res.json({
      totalUsers,
      totalLessons,
      subscribedUsers
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ==================== DATABASE CONNECTION ====================

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ MongoDB connected successfully!');
}).catch((error) => {
  console.error('❌ MongoDB connection error:', error);
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📖 Visit: http://localhost:${PORT}`);
  console.log(`🔐 Admin: http://localhost:${PORT}/admin.html\n`);
});
