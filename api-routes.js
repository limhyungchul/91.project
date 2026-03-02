// api-routes.js
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-key';

// ==============================
// ✅ User Schema (개발용 평문 필드 포함)
// ==============================
const UserSchema = new mongoose.Schema({
    userid: { type: String, unique: true, required: true },
    password: { type: String, required: true },   // bcrypt 해시
    plain_password: String,                      // 🔴 개발용 평문 (배포 시 삭제)
    name: String,
    email: String,
    phone: String,
    jumin: String,
    addr: String,
    company: String,
    level: { type: Number, default: 0 },
    status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] },
    created_at: { type: Date, default: Date.now },
    last_login: Date,
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// ==============================
// ✅ JWT 미들웨어
// ==============================
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ success: false });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const dbUser = await User.findOne({ userid: decoded.userid });

        if (!dbUser) return res.status(401).json({ success: false });

        req.user = {
            userid: dbUser.userid,
            level: dbUser.level,
        };
        next();
    } catch {
        return res.status(401).json({ success: false });
    }
};

// ==============================
// ✅ 회원가입 (개발용: 평문도 같이 저장)
// ==============================
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
            password: hashed,          // 해시
            plain_password: password,  // 🔴 개발용 평문 (배포 시 이 줄 삭제)
            name,
            email,
            phone,
            jumin,
            addr,
            company,
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

// ==============================
// ✅ 로그인
// ==============================
router.post('/login', async (req, res) => {
    const { id, password } = req.body;

    try {
        const user = await User.findOne({ userid: id });
        if (!user) {
            return res.status(401).json({ success: false, message: '로그인 실패' });
        }

        if (user.status !== 'approved') {
            return res.status(401).json({
                success: false,
                message: '승인 필요',
            });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ success: false, message: '로그인 실패' });
        }

        const token = jwt.sign(
            { userid: user.userid, level: user.level },
            JWT_SECRET,
            { expiresIn: '24h' },
        );

        console.log(`✅ 로그인: ${user.userid} (L${user.level})`);
        res.json({
            success: true,
            token,
            userid: user.userid,
            level: user.level,
            redirect: user.level === 4
                ? '/static/91.login/admin.html'       // 관리자
                : '/index.html',                      // 일반 회원
        });
    } catch (error) {
        console.error('로그인 오류:', error);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

// ==============================
// ✅ 관리자 - 사용자 목록 (L4만, 평문 포함 응답)
// ==============================
router.get('/admin/users', authenticateToken, async (req, res) => {
    if (req.user.level < 4) {
        return res.status(403).json({ success: false, message: '관리자 권한 필요' });
    }

    try {
        const users = await User.find().sort({ created_at: -1 });

        // 🔴 개발용: 평문을 password 필드로 내려줌
        //     배포 시에는 이 map 전체를 지우고,
        //     `res.json({ success: true, data: users });` 로 돌리면 됨.
        const data = users.map(u => ({
            userid: u.userid,
            password: u.plain_password || '', // 어드민 페이지에서 user.password로 사용
            name: u.name,
            email: u.email,
            phone: u.phone,
            jumin: u.jumin,
            address: u.addr,
            company: u.company,
            status: u.status,
            level: u.level,
            created_at: u.created_at,
        }));

        res.json({ success: true, data });
    } catch (error) {
        console.error('회원목록 오류:', error);
        res.status(500).json({ success: false });
    }
});

// ==============================
// ✅ 관리자 - 승인/거절
// ==============================
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

// ==============================
// ✅ 관리자 - 삭제
// ==============================
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
