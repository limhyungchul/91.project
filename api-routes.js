// api-routes.js - 로그인 RateLimit(5회) + JWT 자동재발급
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');  // ✅ 로그인 전용 제한

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-key';

/* ===================================================
   ✅ 로그인 전용 Rate Limit (IP당 5회/15분)
=================================================== */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,           // 15분
    max: 5,                             // IP당 5회만 허용
    message: { success: false, message: '15분간 로그인 시도 횟수 초과' },
    standardHeaders: true,
    legacyHeaders: false,
});

/* ===================================================
   ✅ User Schema (개발용 평문 그대로 유지)
=================================================== */
const UserSchema = new mongoose.Schema({
    userid: { type: String, unique: true, required: true },
    password: { type: String, required: true },   // bcrypt 해시
    plain_password: String,                      // 🔴 개발용 평문
    name: String, email: String, phone: String,
    jumin: String, addr: String, company: String,
    level: { type: Number, default: 0 },
    status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] },
    created_at: { type: Date, default: Date.now },
    last_login: Date,
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

/* ===================================================
   ✅ 4️⃣ JWT 미들웨어 강화 (자동 재발급 + 상태 검증)
=================================================== */
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ success: false });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // ✅ 토큰 만료 1시간 전 자동 재발급
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp - now < 60 * 60) {
            const newToken = jwt.sign(
                { userid: decoded.userid, level: decoded.level },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
            res.set('Authorization', `Bearer ${newToken}`);
        }

        // ✅ DB 사용자 + 승인 상태 검증
        const dbUser = await User.findOne({ userid: decoded.userid });
        if (!dbUser || dbUser.status !== 'approved') {
            return res.status(401).json({ success: false });
        }

        req.user = { userid: dbUser.userid, level: dbUser.level };
        next();
    } catch {
        return res.status(401).json({ success: false });
    }
};

/* ===================================================
   ✅ 회원가입 (기존 기능 그대로)
=================================================== */
router.post('/register', async (req, res) => {
    const { id, password, name, email, phone, jumin, addr, company } = req.body;

    try {
        const existing = await User.findOne({ userid: id });
        if (existing) {
            return res.json({ success: false, message: '이미 존재하는 아이디' });
        }

        const hashed = await bcrypt.hash(password, 10);

        await User.create({
            userid: id,
            password: hashed,
            plain_password: password,  // 🔴 개발용
            name, email, phone, jumin, addr, company,
            status: 'pending',
        });

        console.log(`✅ 회원가입: ${id}`);
        res.json({
            success: true,
            redirect: '/static/91.login/loginpage.html',
        });
    } catch (error) {
        console.error('회원가입 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/* ===================================================
   ✅ 로그인 (Rate Limit 5회 적용!)
=================================================== */
router.post('/login', loginLimiter, async (req, res) => {  // 🔒 loginLimiter 적용
    const { id, password } = req.body;

    try {
        const user = await User.findOne({ userid: id });
        if (!user) {
            return res.status(401).json({ success: false, message: '로그인 실패' });
        }

        if (user.status !== 'approved') {
            return res.status(401).json({ success: false, message: '승인 필요' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ success: false, message: '로그인 실패' });
        }

        const token = jwt.sign(
            { userid: user.userid, level: user.level },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log(`✅ 로그인: ${user.userid} (L${user.level})`);
        res.json({
            success: true,
            token, userid: user.userid, level: user.level,
            redirect: user.level === 4
                ? '/static/91.login/admin.html'
                : '/index.html',
        });
    } catch (error) {
        console.error('로그인 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

/* ===================================================
   ✅ 관리자 API (기존 기능 그대로)
=================================================== */
router.get('/admin/users', authenticateToken, async (req, res) => {
    if (req.user.level < 4) {
        return res.status(403).json({ success: false, message: '관리자 권한 필요' });
    }

    try {
        const users = await User.find().sort({ created_at: -1 });
        const data = users.map(u => ({
            userid: u.userid,
            password: u.plain_password || '',
            name: u.name, email: u.email, phone: u.phone,
            jumin: u.jumin, address: u.addr, company: u.company,
            status: u.status, level: u.level, created_at: u.created_at,
        }));
        res.json({ success: true, data });
    } catch (error) {
        console.error('회원목록 오류:', error);
        res.status(500).json({ success: false });
    }
});

router.post('/admin/users', authenticateToken, async (req, res) => {
    if (req.user.level < 4) {
        return res.status(403).json({ success: false, message: '관리자 권한 필요' });
    }
    try {
        const { userid, status } = req.body;
        if (!userid || !status) {
            return res.json({ success: false, message: '파라미터 부족' });
        }
        await User.updateOne({ userid }, { status });
        console.log(`✅ ${userid} → ${status}`);
        res.json({ success: true });
    } catch (error) {
        console.error('승인/거절 오류:', error);
        res.status(500).json({ success: false });
    }
});

router.delete('/admin/users', authenticateToken, async (req, res) => {
    if (req.user.level < 4) {
        return res.status(403).json({ success: false, message: '관리자 권한 필요' });
    }
    try {
        const { userid } = req.body;
        if (!userid) {
            return res.json({ success: false, message: '파라미터 부족' });
        }
        await User.deleteOne({ userid });
        console.log(`✅ ${userid} 삭제됨`);
        res.json({ success: true });
    } catch (error) {
        console.error('삭제 오류:', error);
        res.status(500).json({ success: false });
    }
});

module.exports = router;
