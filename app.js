require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const rootPath = __dirname;

// ✅ MongoDB 연결 (에러 처리 강화)
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB 연결 성공'))
    .catch(err => {
        console.error('❌ MongoDB 연결 실패:', err.message);
        process.exit(1); // 연결 실패시 서버 종료
    });

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/static', express.static(path.join(rootPath, 'static')));

// ✅ 완전한 User Schema (plain_password 추가)
const UserSchema = new mongoose.Schema({
    userid: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    plain_password: { type: String }, // 관리자용 평문 비번 표시
    name: String, email: String, phone: String, jumin: String,
    addr: String, company: String,
    level: { type: Number, default: 1, min: 0, max: 3 },
    status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] },
    created_at: { type: Date, default: Date.now },
    last_login: Date
});
const User = mongoose.model('User', UserSchema);

let allowedIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// ✅ IP 화이트리스트 미들웨어
const checkAllowedIP = (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const normalizedIP = clientIP === '::1' ? '127.0.0.1' : clientIP;
    
    if (!allowedIPs.includes(normalizedIP)) {
        return res.status(403).json({ success: false, message: `IP ${normalizedIP} 접근 차단됨` });
    }
    next();
};

// ✅ JWT 인증 미들웨어 (관리자용)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: '인증 토큰 없음' });
    }

    jwt.verify(token, JWT_SECRET, async (err, user) => {
        if (err) {
            return res.status(401).json({ success: false, message: '토큰 만료 또는 유효하지 않음' });
        }
        
        // 사용자 정보 다시 가져오기
        const dbUser = await User.findOne({ userid: user.userid });
        if (!dbUser) {
            return res.status(401).json({ success: false, message: '사용자 정보 없음' });
        }
        
        req.user = { userid: dbUser.userid, level: dbUser.level };
        next();
    });
};

// ✅ 임시 관리자 로그인 (MongoDB 연결 전용)
app.post('/api/admin-temp-login', (req, res) => {
    const { id, password } = req.body;
    if (id === 'admin' && password === '1234') {
        const token = jwt.sign({ userid: 'admin', level: 3 }, JWT_SECRET, { expiresIn: '24h' });
        res.json({
            success: true,
            token,
            userid: 'admin',
            level: 3
        });
    } else {
        res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 틀렸습니다' });
    }
});

// 1. 회원가입 API
app.post('/api/register', async (req, res) => {
    try {
        const { id, password, name, email, phone, jumin, addr, company } = req.body;

        // 유효성 검사
        if (!id || !password || !name || !email || !phone || !jumin || !addr) {
            return res.json({ success: false, message: '★필수★ 모든 항목 입력' });
        }
        if (password.length < 8) {
            return res.json({ success: false, message: '비밀번호는 8자 이상' });
        }
        if (!/^[a-zA-Z0-9]{4,20}$/.test(id)) {
            return res.json({ success: false, message: '아이디는 영문+숫자 4~20자' });
        }

        // 중복 체크
        const existingUser = await User.findOne({ userid: id });
        if (existingUser) {
            return res.json({ success: false, message: '이미 존재하는 아이디' });
        }

        // 비밀번호 해싱 + 평문 저장 (관리자용)
        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = new User({
            userid: id,
            password: hashedPassword,
            plain_password: password, // 관리자용
            name, email, phone, jumin, addr, company,
            level: 0, // 승인 대기
            status: 'pending'
        });
        await newUser.save();

        console.log(`✅ 신규 가입: ${id} (승인대기)`);
        res.json({
            success: true,
            message: '회원가입 성공! 관리자 승인 대기중',
            redirect: '/static/91.login/membershipapprovalpending.html'
        });
    } catch (err) {
        console.error('회원가입 오류:', err);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

// 2. 로그인 API (실제)
app.post('/api/login', async (req, res) => {
    try {
        const { id, password } = req.body;
        const user = await User.findOne({ userid: id });

        if (!user) {
            return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 틀렸습니다' });
        }
        if (user.status !== 'approved') {
            return res.status(401).json({ success: false, message: `계정 상태: ${user.status === 'pending' ? '승인대기중' : '승인거부'}` });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 틀렸습니다' });
        }

        // 마지막 로그인 업데이트
        user.last_login = new Date();
        await user.save();

        const token = jwt.sign({ userid: user.userid, level: user.level }, JWT_SECRET, { expiresIn: '24h' });
        res.json({
            success: true,
            token,
            userid: user.userid,
            level: user.level
        });
    } catch (err) {
        console.error('로그인 오류:', err);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

// 3. 관리자 API - 회원목록 (plain_password 포함)
app.get('/api/admin/users', authenticateToken, async (req, res) => {
    if (req.user.level < 3) {
        return res.status(403).json({ success: false, message: 'L3 권한 필요 (최고관리자)' });
    }

    try {
        const users = await User.find({}).sort({ created_at: -1 }).lean();
        res.json({
            success: true,
            data: users.map(user => ({
                userid: user.userid,
                plain_password: user.plain_password || '***',
                password: user.password?.slice(0, 20) + '...',
                name: user.name || '-', email: user.email || '-', phone: user.phone || '-',
                jumin: user.jumin || '-', company: user.company || '-', addr: user.addr || '-',
                level: user.level, status: user.status, created_at: user.created_at
            }))
        });
    } catch (err) {
        console.error('회원목록 오류:', err);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

// 4. 관리자 API - 등급변경
app.post('/api/admin/update-level', authenticateToken, async (req, res) => {
    if (req.user.level < 3) return res.status(403).json({ success: false, message: 'L3 권한 필요' });

    try {
        const { userid, level } = req.body;
        if (!userid || !Number.isInteger(level) || level < 0 || level > 3) {
            return res.json({ success: false, message: '유효하지 않은 등급 (0-3)' });
        }
        const result = await User.updateOne({ userid }, { level });
        if (result.matchedCount === 0) {
            return res.json({ success: false, message: '회원 없음' });
        }
        res.json({ success: true, message: `${userid}을 Level ${level}로 변경됨` });
    } catch (err) {
        console.error('등급변경 오류:', err);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

// 5. 관리자 API - 회원삭제
app.post('/api/admin/kick-user', authenticateToken, async (req, res) => {
    if (req.user.level < 3) return res.status(403).json({ success: false, message: 'L3 권한 필요' });

    try {
        const { userid } = req.body;
        const deleted = await User.deleteOne({ userid });
        if (deleted.deletedCount === 0) {
            return res.json({ success: false, message: '회원 없음' });
        }
        console.log(`❌ 강퇴: ${userid}`);
        res.json({ success: true, message: `${userid} 삭제됨` });
    } catch (err) {
        console.error('회원삭제 오류:', err);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

// 6. 관리자 API - IP 관리
app.get('/api/admin/allowed-ips', authenticateToken, (req, res) => {
    if (req.user.level < 3) return res.status(403).json({ success: false, message: 'L3 권한 필요' });
    res.json({ success: true, ips: allowedIPs, total: allowedIPs.length });
});

app.post('/api/admin/add-ip', authenticateToken, (req, res) => {
    if (req.user.level < 3) return res.status(403).json({ success: false, message: 'L3 권한 필요' });
    const { ip } = req.body;
    
    // IP 유효성 검사
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (!ip || !ipRegex.test(ip) || allowedIPs.includes(ip)) {
        return res.json({ success: false, message: '유효하지 않거나 중복된 IP' });
    }
    
    allowedIPs.push(ip);
    console.log(`✅ IP 추가: ${ip}`);
    res.json({ success: true, message: `${ip} 추가됨 (${allowedIPs.length}개)` });
});

app.post('/api/admin/remove-ip', authenticateToken, (req, res) => {
    if (req.user.level < 3) return res.status(403).json({ success: false, message: 'L3 권한 필요' });
    const { ip } = req.body;
    const index = allowedIPs.indexOf(ip);
    if (index === -1) return res.json({ success: false, message: 'IP 목록에 없음' });
    
    allowedIPs.splice(index, 1);
    console.log(`❌ IP 삭제: ${ip}`);
    res.json({ success: true, message: `${ip} 삭제됨 (${allowedIPs.length}개 남음)` });
});

// 7. 계정 찾기
app.post('/api/find-account', async (req, res) => {
    try {
        const { name, email, phone, jumin } = req.body;
        if (!name || !email || !phone || !jumin) {
            return res.json({ success: false, message: '이름,이메일,연락처,주민번호 모두 입력' });
        }
        
        const user = await User.findOne({ 
            name, 
            email, 
            phone, 
            jumin,
            status: 'approved' // 승인된 계정만
        }).select('userid');
        
        if (!user) {
            return res.json({ success: false, message: '일치하는 승인된 계정 없음' });
        }
        res.json({ success: true, userid: user.userid });
    } catch (err) {
        console.error('계정찾기 오류:', err);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

// 8. 비밀번호 재설정
app.post('/api/reset-password', async (req, res) => {
    try {
        const { userid, password } = req.body;
        if (!userid || password.length < 8) {
            return res.json({ success: false, message: '아이디 또는 비밀번호(8자 이상) 확인' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const result = await User.updateOne(
            { userid, status: 'approved' }, 
            { 
                password: hashedPassword,
                plain_password: password
            }
        );
        
        if (result.matchedCount === 0) {
            return res.json({ success: false, message: '승인된 계정이 없거나 존재하지 않습니다' });
        }
        
        console.log(`🔑 비번재설정: ${userid}`);
        res.json({ success: true, message: '비밀번호 변경 완료' });
    } catch (err) {
        console.error('비밀번호재설정 오류:', err);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

// 9. 관리자 API - 승인/거부
app.post('/api/admin/approve-user', authenticateToken, async (req, res) => {
    if (req.user.level < 3) return res.status(403).json({ success: false, message: 'L3 권한 필요' });

    try {
        const { userid, status } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            return res.json({ success: false, message: 'approved/rejected만 가능' });
        }
        
        const result = await User.updateOne({ userid }, { 
            status, 
            level: status === 'approved' ? 1 : 0 
        });
        
        if (result.matchedCount === 0) {
            return res.json({ success: false, message: '회원 없음' });
        }
        
        console.log(`📋 ${userid}: ${status === 'approved' ? '승인' : '거부'}`);
        res.json({ success: true, message: `${userid} ${status === 'approved' ? '승인' : '거부'}됨` });
    } catch (err) {
        console.error('승인처리 오류:', err);
        res.status(500).json({ success: false, message: '서버 오류' });
    }
});

// ✅ 정적 파일 라우팅 (로그인 체크 없이 접근 가능)
app.get('/', (req, res) => {
    res.sendFile(path.join(rootPath, 'static', '91.login', 'loginpage.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(rootPath, 'index.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(rootPath, 'static', 'admin.html'));
});

// 404 처리
app.use((req, res) => {
    res.status(404).json({ success: false, message: '페이지를 찾을 수 없습니다' });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running: http://localhost:${PORT}`);
    console.log(`📁 Static files: http://localhost:${PORT}/static`);
    console.log(`🔐 Admin login: admin/1234 (임시)`);
    console.log(`📋 모든 API 완전 연결됨!\n`);
});
