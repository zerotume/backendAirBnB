const express = require('express');
const router = express.Router();
const {Spot, Image, Review, User, Booking, sequelize} = require('../db/models');
const {setTokenCookie, restoreUser, requireAuth, AuthorCheck, refuseOwner, spotReq,spotImgReq} = require('../utils/auth.js');
const {handleValidationErrors} = require('../utils/validation.js');
const {check} = require('express-validator');
const user = require('../db/models/user');
const { Op } = require('sequelize');
const { ResultWithContext } = require('express-validator/src/chain');

// const validateBooking = [
//     check('startDate')
//         .exists({checkFalsy:true})
//         .notEmpty()
//         .isDate()
//         .withMessage('Start date YYYY-MM-DD is required'),
//     check('endDate')
//         .exists({checkFalsy:true})
//         .notEmpty()
//         .isInt({min:1, max:5})
//         .withMessage('End date YYYY-MM-DD is required'),
//     handleValidationErrors
// ];

// let imgExt = [
//     '.bmp',
//     '.tif',
//     '.tiff',
//     '.jpg',
//     '.jpeg',
//     '.gif',
//     '.png',
//     '.eps',
//     '.raw'];

const validateImage = [
    check('url')
        .exists({checkFalsy:true})
        .notEmpty()
        .withMessage('Url must be a valid picture url'),
    handleValidationErrors
];

router.post('/:id/images', validateImage, restoreUser, requireAuth, spotReq, AuthorCheck,
    async (req, res, next) => {
        let {url} = req.body;
        let reviewId = null;
        let spotId = req.spot.toJSON().id;
        let imageType = 'spot';
        let newImage;
        try{
            newImage = await Image.create({
                url,
                imageType,
                spotId,
                reviewId
            });
        }catch(err){
            next(err);
        }

        let result = await Image.findByPk(newImage.toJSON().id,{
            attributes:[
                'id',
                ['spotId','imageableId'],
                ['imageType','imageableType',],
                'url'
            ]
        });

        res.json(result);
    });

let d = new Date();
let today = d.toISOString().slice(0,10);

const validateBooking = [
    check('startDate')
        .exists({checkFalsy:true})
        .notEmpty()
        .isDate()
        .withMessage('Start date YYYY-MM-DD is required'),
    check('endDate')
        .exists({checkFalsy:true})
        .notEmpty()
        .isDate()
        .withMessage('End date YYYY-MM-DD is required'),
    handleValidationErrors
];

router.post('/:id/bookings', restoreUser, requireAuth, spotReq, refuseOwner,
    validateBooking, async (req,res,next) => {
        let {startDate, endDate} = req.body;

        if(startDate < today || endDate < today){
            const err = Error('You cannot set the booking to the past.');
            err.title = 'You cannot set the booking to the past.'
            err.message = 'You cannot set the booking to the past.';
            err.status = 400;
            return next(err);
        }

        let userId = req.user.toJSON().id;
        let spotId = req.spot.toJSON().id;
        let newBooking;
        try{
            newBooking = await Booking.create({
                userId,
                spotId,
                startDate,
                endDate
            });
        }catch(e){
            if(e.name === 'SequelizeUniqueConstraintError'){
                const err = Error('Sorry, this spot is already booked for the specified dates');
                err.title = 'Sorry, this spot is already booked for the specified dates'
                err.message = 'Sorry, this spot is already booked for the specified dates';
                err.errors = {
                    startDate:"Start date conflicts with an existing booking",
                    endDate: "End date conflicts with an existing booking"
                };
                err.status = 403;
                return next(err);
            }else{
                return next(e);
            }
        }
        return res.json(newBooking);
});

router.get('/:id/bookings',restoreUser, requireAuth, spotReq,
    async (req,res) => {
        let currentUser = req.user.toJSON().id;
        let spot = req.spot.toJSON();
        let bookings;
        if(currentUser === spot.ownerId){
            bookings = await Booking.findAll({
                where:{spotId:spot.id},
                include:{
                    model:User,
                }
            });
        }else{
            bookings = await Booking.scope('notOwner').findAll({
                where:{spotId:spot.id}
            });
        }
        return res.json({Bookings:bookings});
});

router.get('/:id/reviews', spotReq, async (req, res) => {
    let reviews = await Review.findAll({
        where:{
            spotId:req.params.id
        },
        include:[
            {
                model:User
            },
            {
                model:Image,
                as:'images',
                where:{
                    imageType:'review'
                },
                attributes:['id','url'],
                required:false,
                raw:true
            }
        ]
    });

    return res.json({Reviews:reviews});
});


const validateReview = [
    check('review')
        .exists({checkFalsy:true})
        .notEmpty()
        .withMessage('Review text is required'),
    check('stars')
        .exists({checkFalsy:true})
        .notEmpty()
        .isInt({min:1, max:5})
        .withMessage('Stars must be an integer from 1 to 5'),
    handleValidationErrors
];

router.post('/:id/reviews', restoreUser, requireAuth, spotReq, refuseOwner,
            validateReview, async (req, res, next) => {
    let userId = req.user.toJSON().id;
    let spotId = req.spot.toJSON().id;
    let {review,stars} = req.body;
    let newReview;
    try{
        newReview = await Review.create({
            userId,
            spotId,
            review,
            stars
        });
    }catch(e){
        if(e.name === 'SequelizeUniqueConstraintError'){
            const err = Error('User already has a review for this spot');
            err.title = 'User already has a review for this spot'
            err.message = 'User already has a review for this spot';
            err.status = 403;
            return next(err);
        }else{
            return next(e);
        }
    }

    return res.json(newReview);
});


router.get('/myspots', restoreUser, requireAuth, async (req,res) => {
    let myid = req.user.toJSON().id;

    let myspots = await Spot.findAll({
        where:{ownerId:myid},
        attributes:{
            // include:[
            //     [sequelize.col('Images.url'), 'previewImage']//so alias will be used here
            // ]
        },
        include:{
            model:Image,
            as:'previewImage',
            where:{imageType:'spot'},
            attributes:['id','url'],
            required:false,
        }
    });

    return res.json(myspots);
});

router.get('/:id', async (req, res, next) => {
    let result = await Spot.findOne({
        where:{
            id:req.params.id
        },
        attributes:{
            include:[
                [
                    sequelize.fn("COUNT", sequelize.col("Reviews.review")),
                    "numReviews"
                ],
                [
                    sequelize.fn("AVG", sequelize.col("Reviews.stars")),
                    "avgStarRating"
                ]
            ]
        },
        include:[
            {
                model:User,
                as:'Owner'
            },
            {
                model:Review,
                required:false,
                attributes:[]
            },
        ],
        group:['Spot.id','Owner.id']
    });

    if(!result){
        const err = Error('Spot couldn\'t be found');
        err.status = 404;
        err.title = 'Spot couldn\'t be found';
        err.message = 'Spot couldn\'t be found';
        return next(err);
    }
    result = result.toJSON();
    let imgs = await Image.findAll({
        where:{
            spotId:req.params.id
        },
        attributes:['id','url'],
        raw:true
    });
    result.images = imgs.map(e => e.url);
    return res.json(result);
});



const validateSpot = [
    check('address')
        .exists({checkFalsy:true})
        .notEmpty()
        .withMessage('Street address is required'),
    check('city')
        .exists({checkFalsy:true})
        .notEmpty()
        .withMessage('City is required'),
    check('state')
        .exists({checkFalsy:true})
        .notEmpty()
        .withMessage('State is required'),
    check('country')
        .exists({checkFalsy:true})
        .notEmpty()
        .withMessage('Country is required'),
    check('lat')
        .exists({checkFalsy:true})
        .notEmpty()
        .isFloat({min:-89.9999999, max:89.9999999})
        .withMessage('Latitude is not valid'),
    check('lng')
        .exists({checkFalsy:true})
        .notEmpty()
        .isFloat({min:-179.9999999, max:179.9999999})
        .withMessage('Longitude is not valid'),
    check('name')
        .exists({checkFalsy:true})
        .notEmpty()
        .isLength({min:1, max:50})
        .withMessage('name is required and must be less than 50 characters'),
    check('description')
        .exists({checkFalsy:true})
        .notEmpty()
        .withMessage('Description is required'),
    check('price')
        .exists({checkFalsy:true})
        .notEmpty()
        .withMessage('Price per day is required'),
    handleValidationErrors
];

router.put('/:id', validateSpot,
        restoreUser, requireAuth, spotReq, AuthorCheck,
        async (req, res, next) => {
            let spot = req.spot;
            const {address,city,state,country,lat,lng,name,description,price} = req.body;
            try{
                spot.set({
                    address,
                    city,
                    state,
                    country,
                    lat,
                    lng,
                    name,
                    description,
                    price
                });
                await spot.save();
            }catch(e){
                if(e.name === 'SequelizeUniqueConstraintError'){
                    const err = Error('Spot already exists');
                    err.title = 'Spot already exists'
                    err.message = 'Spot already exists';
                    err.status = 403;
                    err.errors = {};
                    err.errors[(e.errors)[0].path] = `Spot with that ${(e.errors)[0].path} already exists.`
                    return next(err);
                }else{
                    return next(e);
                }
            }

            let updated = await Spot.findByPk(req.params.id);
            return res.json(updated);
});

router.post('/', validateSpot, restoreUser, requireAuth, async (req, res, next) => {
    const {address,city,state,country,lat,lng,name,description,price} = req.body;
    const ownerId = req.user.toJSON().id;
    let spot;
    try{
        spot = await Spot.create({
            ownerId,
            address,
            city,
            state,
            country,
            lat,
            lng,
            name,
            description,
            price
        });
    }catch(e){
        if(e.name === 'SequelizeUniqueConstraintError'){
            const err = Error('Spot already exists');
            err.title = 'Spot already exists'
            err.message = 'Spot already exists';
            err.status = 403;
            err.errors = {};
            err.errors[(e.errors)[0].path] = `Spot with that ${(e.errors)[0].path} already exists.`
            return next(err);
        }else{
            return next(e);
        }
    }
    return res.json({...spot.toJSON()});
});

router.delete('/:id',
    restoreUser, requireAuth, spotReq, AuthorCheck,
    async (req, res) => {
        let spot = req.spot;
        await spot.destroy();
        res.json({"message": "Successfully deleted","statusCode": 200});
});

const validateFilters = [
    check('page')
        .optional()
        .isInt({min:1})
        .withMessage('Page must be greater than or equal to 0'),
    check('size')
        .optional()
        .isInt({min:0})
        .withMessage('Size must be greater than or equal to 0'),
    check('minLat')
        .optional()
        .isDecimal()
        .withMessage('Maximum latitude is invalid'),
    check('maxLat')
        .optional()
        .isDecimal()
        .withMessage('Minimum latitude is invalid'),
    check('minLng')
        .optional()
        .isDecimal()
        .withMessage('Maximum longitude is invalid'),
    check('maxLng')
        .optional()
        .isDecimal()
        .withMessage('Minimum longitude is invalid'),
    check('minPrice')
        .optional()
        .isFloat({min:0})
        .withMessage('Maximum price must be greater than 0'),
    check('maxPrice')
        .optional()
        .isFloat({min:0})
        .withMessage('Minimum price must be greater than 0'),
    handleValidationErrors
];

router.get('/', validateFilters, async (req, res) => {
    let {page,size,minLat,maxLat,minLng,maxLng,minPrice,maxPrice} = req.query;
    page = page?parseInt(page):1;
    //changed: page should be 1 minimumly
    size = size?parseInt(size):20;
    page = (page > 10)?10:page;
    //when size is 0, it gives nothing
    size = (size > 20)?20:size;

    let pagination = {};

    // if(page > 0){
    pagination.limit = size;
    pagination.offset = (page-1)*size;
    // }


    let opMinLat = minLat===undefined?({}):({[Op.gte]:minLat});
    let opMaxLat = maxLat===undefined?({}):({[Op.lte]:maxLat});
    let opMinLng = minLng===undefined?({}):({[Op.gte]:minLng});
    let opMaxLng = maxLng===undefined?({}):({[Op.lte]:maxLng});
    let opMinPri = minPrice===undefined?({}):({[Op.gte]:minPrice});
    let opMaxPri = maxPrice===undefined?({}):({[Op.lte]:maxPrice});

    let where = {};
    if(minLat !== undefined || maxLat !== undefined)where.lat = {...opMinLat, ...opMaxLat};
    if(minLng !== undefined || maxLng !== undefined)where.lng = {...opMinLng, ...opMaxLng};
    if(minPrice !== undefined || maxPrice !== undefined)where.price = {...opMinPri, ...opMaxPri};

    let result = {};
    result.Spots = await Spot.findAll({
        where,
        attributes:{
            // include:[
            //     [sequelize.col('Images.url'), 'previewImage']//so alias will be used here
            // ]
        },
        include:{
            model:Image,
            as:'previewImage',
            attributes:['id','url'],
            where:{
                reviewId:null
            },
            required:false,
        },
        order:[['id']],
        ...pagination
    });

    // result = result.toJSON();
    result.page = page;
    result.size = result.Spots.length;
    return res.json(result);
});

module.exports = router;
