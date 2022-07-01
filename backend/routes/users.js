const express = require('express');
const {check} = require('express-validator');
const {handleValidationErrors} = require('../utils/validation.js');

const {setTokenCookie, restoreUser, requireAuth} = require('../utils/auth.js');
const {User} = require('../db/models');

const router = express.Router();

const validateLogin = [
    check('credential')
        .exists({checkFalsy: true})
        .notEmpty()
        .withMessage('Please provide a valid email or username'),
    check('password')
        .exists({checkFalsy: true})
        .withMessage('Please provide a password'),
    handleValidationErrors
];

router.post('/login', validateLogin, async (req,res,next) => {
    const {credential, password} = req.body;

    const user = await User.login({credential, password});

    if(!user){
        const err = new Error('Login Failed');
        err.status = 401;
        err.title = 'Login Failed';
        err.errors = ['The provided credentials were invalid.']
        return next(err);
    }

    await setTokenCookie(res, user);

    return res.json({user});
});

router.delete('/', (_req, res) => {
    res.clearCookie('token');
    return res.json({message:'success'});
});


const validateSignup = [
    check('email')
        .exists({checkFalsy:true})
        .isEmail()
        .isLength({min:3})
        .withMessage('Please provide a valid email with at least 3 characters.'),
    check('username')
        .exists({checkFalsy: true})
        .isLength({min:4})
        .withMessage('Please provide a username with at least 4 characters'),
    check('username')
        .not()
        .isEmail()
        .withMessage('Username cannot be an email.'),
    check('firstName')
        .exists({checkFalsy:true})
        .isLength({min:1})
        .withMessage('Please provide a valid first name.'),
    check('lastName')
        .exists({checkFalsy:true})
        .isLength({min:1})
        .withMessage('Please provide a valid last name.'),
    check('password')
        .exists({checkFalsy:true})
        .isLength({min:6})
        .withMessage('Password must be 6 characters or more'),
    handleValidationErrors
];

router.post('/signup', validateSignup, async (req,res) => {
    const {email, password, username, firstName, lastName} = req.body;
    const user = await User.signup({email, password, username, firstName, lastName});

    await setTokenCookie(res, user);

    return res.json({user});

    /*
    test data:
    {
        "username":"catuser4",
        "email":"mewfour@cat.com",
        "password":"password4",
        "firstName":"MeowFour",
        "lastName":"Nyan"
    }
    */
});

module.exports = router;
