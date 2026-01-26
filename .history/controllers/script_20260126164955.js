const Script = require('../models/Script.js');
const User = require('../models/User');
const Notification = require('../models/Notification');
const helpers = require('./helpers');
const _ = require('lodash');
const dotenv = require('dotenv');
dotenv.config({ path: '.env' }); // See the file .env.example for the structure of .env

/**
 * GET /
 * Fetch and render newsfeed.
 */
const fs = require('fs');
const path = require('path');


const orderFilePath = path.join(__dirname, 'feedOrder.json');

async function getTopicScripts(scriptTO) {
    let desired = [];

    // food: 57~63，每张图 freal + fAI，共14条
    if (scriptTO === "food") {
        for (let pic = 57; pic <= 63; pic++) {
            desired.push({ class: "freal", picture: `${pic}.jpg` });
            desired.push({ class: "fAI", picture: `${pic}.jpg` });
        }
    }
    // 1~28：每个 topic 4条
    else {
        const topicNum = parseInt(scriptTO, 10);
        if (!Number.isFinite(topicNum) || topicNum < 1 || topicNum > 28) {
            throw new Error(`Invalid scriptTO: ${scriptTO}`);
        }

        const pic1 = 1 + (topicNum - 1) * 2;
        const pic2 = pic1 + 1;

        desired = [
            { class: "creal", picture: `${pic1}.jpg` },
            { class: "cAI", picture: `${pic1}.jpg` },
            { class: "lreal", picture: `${pic2}.jpg` },
            { class: "lAI", picture: `${pic2}.jpg` },
        ];
    }

    // 一次性查出来
    const scripts = await Script.find({
        $or: desired.map(d => ({ class: d.class, picture: d.picture }))
    })
        .populate("actor")
        .populate({
            path: "comments.actor",
            model: "Actor",
            options: { strictPopulate: false }
        })
        .exec();

    // 按 desired 顺序排好
    const map = new Map();
    for (const s of scripts) {
        const key = `${s.class}__${s.picture}`;
        if (!map.has(key)) map.set(key, s);
    }

    return desired.map(d => map.get(`${d.class}__${d.picture}`)).filter(Boolean);
}

function saveOrderToFile(order) {
    fs.writeFileSync(orderFilePath, JSON.stringify(order), 'utf8');
}

function loadOrderFromFile() {
    if (fs.existsSync(orderFilePath)) {
        const orderData = fs.readFileSync(orderFilePath, 'utf8');
        return JSON.parse(orderData);
    }
    return null;
}

function shuffleArray(array) {
    return _.shuffle(array);
}

async function getOrCreateFeedOrder(groupId, script_feed) {
    let order = loadOrderFromFile();
    if (!order || !order[groupId]) {
        // Generate a new random order
        order = order || {};
        order[groupId] = shuffleArray(script_feed.map(post => post._id.toString()));
        // Save the order to the local file
        saveOrderToFile(order);
    }
    return order[groupId];
}
exports.getScriptFeed = async (req, res, next) => {
    try {
        let participantID = Math.floor(Math.random() * 5000000); // replace this with the next line once we have participantID in URL
        // let participantID = req.query.pID;
        let scriptPO = req.query.PO;
        let scriptPE = req.query.PE;
        let scriptUID = req.query.UID;
        let scriptTO = req.query.TO;
        let admin = req.query.admin;

        if (!scriptUID) {
            return res.status(400).send('Prolific ID is required');
        }

        // Check if the user already exists
        let existingUser = await User.findOne({ prolificID: scriptUID }).exec();
        console.log('Existing User:', existingUser);
        if (!existingUser) {
            // If user does not exist, create a new one
            existingUser = new User({
                email: participantID + '@gmail.com',
                password: 'password',
                username: participantID,
                AL: scriptPO,
                CN: scriptPE,
                prolificID: scriptUID,
                isAdmin: admin,
            });

            await existingUser.save();
        }
        else {
            // If user exists, retrieve AL and CN from the database
            scriptPO = existingUser.PO;
            scriptPE = existingUser.PE;
            admin = existingUser.isAdmin;
        }

        req.logIn(existingUser, async (err) => {


            const one_day = 86400000; // Number of milliseconds in a day.
            const time_now = Date.now(); // Current date.
            const time_diff = time_now - req.user.createdAt; // Time difference between now and user account creation, in milliseconds.
            const time_limit = time_diff - one_day; // Date in milliseconds 24 hours ago from now.
            const user = await User.findById(req.user.id);
            if (!user) {
                throw new Error('User not found');
            }
            const current_day = Math.floor(time_diff / one_day);
            if (current_day < process.env.NUM_DAYS) {
                user.study_days[current_day] += 1;
            }

            if (admin) {
                let script_feed = await Script.find()
                    .sort('-time')
                    .populate('actor')
                    .exec();

                let user_posts = user.getPostInPeriod(0, time_diff);
                user_posts.sort((a, b) => b.relativeTime - a.relativeTime);

                const finalfeed = helpers.getFeed(user_posts, script_feed, user, process.env.FEED_ORDER, true);
                console.log("Script Size is now: " + finalfeed.length);
                await user.save();
                res.render('script', { script: finalfeed, showNewPostIcon: true, user: user });
            } else if (scriptTO && scriptTO !== "null" && scriptTO !== "undefined" && scriptTO !== "") {
                const script_feed = await getTopicScripts(scriptTO);

                if (!script_feed || script_feed.length === 0) {
                    return res.status(404).send("No topic script feed found.");
                }

                let user_posts = user.getPostInPeriod(0, time_diff);
                user_posts.sort((a, b) => b.relativeTime - a.relativeTime);

                const finalfeed = helpers.getFeed(user_posts, script_feed, user, process.env.FEED_ORDER, true, true);

                return res.render("script", { script: finalfeed, script_type: scriptTO, user: user });
            } else {
                let query = {};

                if (scriptPE === "l") {
                    query = { "class": { $in: ["lAI", "lreal", "fAI", "freal"] } };
                } else {
                    query = { "class": { $in: ["cAI", "creal", "fAI", "freal"] } };
                }

                let sortCriteria = {};


                if (scriptPO === "0") {
                    sortCriteria = { time: -1 }; // Sort by creation time, latest first
                } else if (scriptPO === "40") {
                    sortCriteria = { likes: -1 }; // Sort by number of sum, highest first
                } else {
                    // Default sorting (shuffle)
                    sortCriteria = { _id: 1 }; // This line is a placeholder for sorting by ID if shuffling is not done server-side

                }

                let script_feed = await Script.find(query)
                    .sort(sortCriteria)
                    .populate('actor')
                    .populate({
                        path: 'comments.actor',
                        model: 'Actor',
                        options: { strictPopulate: false }
                    })
                    .exec();

                // Shuffle the posts if no specific sorting is applied
                if (["r"].includes(scriptPO)) {
                    //script_feed = _.shuffle(script_feed);
                    const groupId = `${scriptPE}-your-group-id`; // Combine content type with group ID
                    //const order = await getOrCreateFeedOrder(groupId, script_feed);
                    //script_feed.sort((a, b) => order.indexOf(a._id.toString()) - order.indexOf(b._id.toString()));
                    const order = await getOrCreateFeedOrder(groupId, script_feed);
                    script_feed.sort((a, b) => order.indexOf(a._id.toString()) - order.indexOf(b._id.toString()));
                }
                else if (["e"].includes(scriptPO)) {
                    script_feed.forEach(script => {
                        script.totalInteractions = (script.likes || 0) + (script.shares || 0) + (script.comments ? script.comments.length : 0);
                    });

                    // Sort by totalInteractions in descending order
                    script_feed.sort((a, b) => b.totalInteractions - a.totalInteractions);

                }

                // Ensure script_feed is not empty
                if (!script_feed || script_feed.length === 0) {
                    console.log("No script feed found for the given query and sorting criteria.");
                    return res.status(404).send("No script feed found.");
                }
                let user_posts = user.getPostInPeriod(0, time_diff);
                user_posts.sort((a, b) => b.relativeTime - a.relativeTime);

                // Generate the final feed using the helper function
                const finalfeed = helpers.getFeed(user_posts, script_feed, user, process.env.FEED_ORDER, true, true);

                res.render('script', { script: finalfeed, script_type: "", user: user });
            }

        });
    } catch (err) {
        next(err);
    }
};
exports.postUpdateFeedActionNoLOGIN = async (req, res, next) => {
    try {

        const prolificID = req.query.UID;
        console.log('Request Query:', req.query);
        console.log('Request Body:', req.body);
        if (!prolificID) {
            return res.status(400).send('Prolific ID is required');
        }


        // Find the user by prolificID
        const user = await User.findOne({ prolificID: prolificID }).exec();
        console.log('User found:', user); // Debugging: log the user
        console.log(user);
        // Check if user has interacted with the post before.
        let feedIndex = _.findIndex(user.feedAction, function (o) { return o.post == req.body.postID; });

        // If the user has not interacted with the post before, add the post to user.feedAction.
        if (feedIndex == -1) {
            const cat = {
                post: req.body.postID,
                postClass: req.body.postClass,
            };
            feedIndex = user.feedAction.push(cat) - 1;
        }

        // User created a new comment on the post.
        if (req.body.new_comment) {
            user.numComments = user.numComments + 1;
            const cat = {
                new_comment: true,
                new_comment_id: user.numComments,
                body: req.body.comment_text,
                relativeTime: req.body.new_comment - user.createdAt,
                absTime: req.body.new_comment,
                liked: false,
                flagged: false,
            }
            user.feedAction[feedIndex].comments.push(cat);
        }
        // User interacted with a comment on the post.
        else if (req.body.commentID) {
            const isUserComment = (req.body.isUserComment == 'true');
            // Check if user has interacted with the comment before.
            let commentIndex = (isUserComment) ?
                _.findIndex(user.feedAction[feedIndex].comments, function (o) {
                    return o.new_comment_id == req.body.commentID && o.new_comment == isUserComment
                }) :
                _.findIndex(user.feedAction[feedIndex].comments, function (o) {
                    return o.comment == req.body.commentID && o.new_comment == isUserComment
                });

            // If the user has not interacted with the comment before, add the comment to user.feedAction[feedIndex].comments
            if (commentIndex == -1) {
                const cat = {
                    comment: req.body.commentID
                };
                user.feedAction[feedIndex].comments.push(cat);
                commentIndex = user.feedAction[feedIndex].comments.length - 1;
            }

            // User liked the comment.
            if (req.body.like) {
                const like = req.body.like;
                user.feedAction[feedIndex].comments[commentIndex].likeTime.push(like);
                user.feedAction[feedIndex].comments[commentIndex].liked = true;
                if (req.body.isUserComment != 'true') user.numCommentLikes++;
            }

            // User unliked the comment.
            if (req.body.unlike) {
                const unlike = req.body.unlike;
                user.feedAction[feedIndex].comments[commentIndex].unlikeTime.push(unlike);
                user.feedAction[feedIndex].comments[commentIndex].liked = false;
                if (req.body.isUserComment != 'true') user.numCommentLikes--;
            }
        
            // User flagged the comment.
            else if (req.body.flag) {
                const flag = req.body.flag;
                user.feedAction[feedIndex].comments[commentIndex].flagTime.push(flag);
                user.feedAction[feedIndex].comments[commentIndex].flagged = true;
            }
        }
        // User interacted with the post.
        else {
            // User flagged the post.
            if (req.body.flag) {
                const flag = req.body.flag;
                user.feedAction[feedIndex].flagTime = [flag];
                user.feedAction[feedIndex].flagged = true;
            }

            // User liked the post.
            else if (req.body.like) {
                const like = req.body.like;
                user.feedAction[feedIndex].likeTime.push(like);
                user.feedAction[feedIndex].liked = true;
                user.numPostLikes++;
            }
            // User unliked the post.
            else if (req.body.unlike) {
                const unlike = req.body.unlike;
                user.feedAction[feedIndex].unlikeTime.push(unlike);
                user.feedAction[feedIndex].liked = false;
                user.numPostLikes--;
            } // user dislike the post 
             else if (req.body.dislike) {
                const dislike = req.body.dislike;
                user.feedAction[feedIndex].dislikeTime.push(dislike);
                user.feedAction[feedIndex].disliked = true;
                user.numPostDisLikes++;
            }
            // User undisliked the post.
            else if (req.body.undislike) {
                const undislike = req.body.undislike;
                user.feedAction[feedIndex].undislikeTime.push(undislike);
                user.feedAction[feedIndex].disliked = false;
                user.numPostDisLikes--;
            }
            // User read the post.
            else if (req.body.viewed) {
                const view = req.body.viewed;
                user.feedAction[feedIndex].readTime.push(view);
                user.feedAction[feedIndex].rereadTimes++;
                user.feedAction[feedIndex].mostRecentTime = Date.now();
            } else {
                console.log('Something in feedAction went crazy. You should never see this.');
            }
        }
        await user.save();
        res.send({ result: "success", numComments: user.numComments });
    } catch (err) {
        next(err);
    }
};

exports.getScript = async (req, res, next) => {
    try {
        const one_day = 86400000; // Number of milliseconds in a day.
        const time_now = Date.now(); // Current date.
        const time_diff = time_now - req.user.createdAt; // Time difference between now and user account creation, in milliseconds.
        const time_limit = time_diff - one_day; // Date in milliseconds 24 hours ago from now. This is used later to show posts only in the past 24 hours.

        const user = await User.findById(req.user.id)
            .populate('posts.comments.actor')
            .exec();

        // If the user is no longer active, sign the user out.
        if (!user.active) {
            req.logout((err) => {
                if (err) console.log('Error : Failed to logout.', err);
                req.session.destroy((err) => {
                    if (err) console.log('Error : Failed to destroy the session during logout.', err);
                    req.user = null;
                    req.flash('errors', { msg: 'Account is no longer active. Study is over.' });
                    res.redirect('/login');
                });
            });
        }

        // What day in the study is the user in? 
        // Update study_days, which tracks the number of time user views feed.
        const current_day = Math.floor(time_diff / one_day);
        if (current_day < process.env.NUM_DAYS) {
            user.study_days[current_day] += 1;
        }

        // Array of actor posts that match the user's experimental condition, within the past 24 hours, sorted by descending time. 
        let script_feed = await Script.find()
            .where('time').lte(time_diff).gte(time_limit)
            .sort('-time')
            .populate('actor')
            .populate('comments.actor')
            .exec();

        // Array of any user-made posts within the past 24 hours, sorted by time they were created.
        let user_posts = user.getPostInPeriod(time_limit, time_diff);
        user_posts.sort(function (a, b) {
            return b.relativeTime - a.relativeTime;
        });

        // Get the newsfeed and render it.
        const finalfeed = helpers.getFeed(user_posts, script_feed, user, process.env.FEED_ORDER, true);
        console.log("Script Size is now: " + finalfeed.length);
        await user.save();
        res.render('script', { script: finalfeed, showNewPostIcon: true, user: user });
    } catch (err) {
        next(err);
    }
};

/*
 * Post /post/new
 * Record a new user-made post. Include any actor replies (comments) that go along with it.
 */
exports.newPost = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).exec();
        if (req.file) {
            user.numPosts = user.numPosts + 1; // Count begins at 0
            const currDate = Date.now();

            let post = {
                type: "user_post",
                postID: user.numPosts,
                body: req.body.body,
                picture: req.file.filename,
                liked: false,
                likes: 0,
                comments: [],
                absTime: currDate,
                relativeTime: currDate - user.createdAt,
            };

            // Find any Actor replies (comments) that go along with this post
            const actor_replies = await Notification.find()
                .where('userPostID').equals(post.postID)
                .where('notificationType').equals('reply')
                .populate('actor').exec();

            // If there are Actor replies (comments) that go along with this post, add them to the user's post.
            if (actor_replies.length > 0) {
                for (const reply of actor_replies) {
                    user.numActorReplies = user.numActorReplies + 1; // Count begins at 0
                    const tmp_actor_reply = {
                        actor: reply.actor._id,
                        body: reply.replyBody,
                        commentID: user.numActorReplies,
                        relativeTime: post.relativeTime + reply.time,
                        absTime: new Date(user.createdAt.getTime() + post.relativeTime + reply.time),
                        new_comment: false,
                        liked: false,
                        flagged: false,
                        likes: 0
                    };
                    post.comments.push(tmp_actor_reply);
                }
            }
            user.posts.unshift(post); // Add most recent user-made post to the beginning of the array
            await user.save();
            res.redirect('/');
        } else {
            req.flash('errors', { msg: 'ERROR: Your post did not get sent. Please include a photo and a caption.' });
            res.redirect('/');
        }
    } catch (err) {
        next(err);
    }
};

/**
 * POST /feed/
 * Record user's actions on ACTOR posts. 
 */
exports.postUpdateFeedAction = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).exec();
        // Check if user has interacted with the post before.
        let feedIndex = _.findIndex(user.feedAction, function (o) { return o.post == req.body.postID; });

        // If the user has not interacted with the post before, add the post to user.feedAction.
        if (feedIndex == -1) {
            const cat = {
                post: req.body.postID,
                postClass: req.body.postClass,
            };
            feedIndex = user.feedAction.push(cat) - 1;
        }

        // User created a new comment on the post.
        if (req.body.new_comment) {
            user.numComments = user.numComments + 1;
            const cat = {
                new_comment: true,
                new_comment_id: user.numComments,
                body: req.body.comment_text,
                relativeTime: req.body.new_comment - user.createdAt,
                absTime: req.body.new_comment,
                liked: false,
                flagged: false,
            }
            user.feedAction[feedIndex].comments.push(cat);
        }
        // User interacted with a comment on the post.
        else if (req.body.commentID) {
            const isUserComment = (req.body.isUserComment == 'true');
            // Check if user has interacted with the comment before.
            let commentIndex = (isUserComment) ?
                _.findIndex(user.feedAction[feedIndex].comments, function (o) {
                    return o.new_comment_id == req.body.commentID && o.new_comment == isUserComment
                }) :
                _.findIndex(user.feedAction[feedIndex].comments, function (o) {
                    return o.comment == req.body.commentID && o.new_comment == isUserComment
                });

            // If the user has not interacted with the comment before, add the comment to user.feedAction[feedIndex].comments
            if (commentIndex == -1) {
                const cat = {
                    comment: req.body.commentID
                };
                user.feedAction[feedIndex].comments.push(cat);
                commentIndex = user.feedAction[feedIndex].comments.length - 1;
            }

            // User liked the comment.
            if (req.body.like) {
                const like = req.body.like;
                user.feedAction[feedIndex].comments[commentIndex].likeTime.push(like);
                user.feedAction[feedIndex].comments[commentIndex].liked = true;
                if (req.body.isUserComment != 'true') user.numCommentLikes++;
            }

            // User unliked the comment.
            if (req.body.unlike) {
                const unlike = req.body.unlike;
                user.feedAction[feedIndex].comments[commentIndex].unlikeTime.push(unlike);
                user.feedAction[feedIndex].comments[commentIndex].liked = false;
                if (req.body.isUserComment != 'true') user.numCommentLikes--;
            }

            // User flagged the comment.
            else if (req.body.flag) {
                const flag = req.body.flag;
                user.feedAction[feedIndex].comments[commentIndex].flagTime.push(flag);
                user.feedAction[feedIndex].comments[commentIndex].flagged = true;
            }
        }
        // User interacted with the post.
        else {
            // User flagged the post.
            if (req.body.share) {
                const share = req.body.share;
                user.feedAction[feedIndex].shareTime = [share];
                user.feedAction[feedIndex].shared = true;
                user.numPostShared++;
            }
            // if user undo the share 
            else if (req.body.unshare) {
                const unshare = req.body.unshare;
                user.feedAction[feedIndex].unshareTime = [unshare];
                user.feedAction[feedIndex].shared = false;
                user.numPostShared--;
            }
            // User liked the post.
            else if (req.body.like) {
                const like = req.body.like;
                user.feedAction[feedIndex].likeTime.push(like);
                user.feedAction[feedIndex].liked = true;
                user.numPostLikes++;
            }
            // User unliked the post.
            else if (req.body.unlike) {
                const unlike = req.body.unlike;
                user.feedAction[feedIndex].unlikeTime.push(unlike);
                user.feedAction[feedIndex].liked = false;
                user.numPostLikes--;
            }
            // User read the post.
            else if (req.body.viewed) {
                const view = req.body.viewed;
                user.feedAction[feedIndex].readTime.push(view);
                user.feedAction[feedIndex].rereadTimes++;
                user.feedAction[feedIndex].mostRecentTime = Date.now();
            } else {
                console.log('Something in feedAction went crazy. You should never see this.');
            }
        }
        await user.save();
        res.send({ result: "success", numComments: user.numComments });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /userPost_feed/
 * Record user's actions on USER posts. 
 */
exports.postUpdateUserPostFeedAction = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).exec();
        // Find the index of object in user.posts
        let feedIndex = _.findIndex(user.posts, function (o) { return o.postID == req.body.postID; });

        if (feedIndex == -1) {
            // Should not happen.
        }
        // User created a new comment on the post.
        else if (req.body.new_comment) {
            user.numComments = user.numComments + 1;
            const cat = {
                body: req.body.comment_text,
                commentID: user.numComments,
                relativeTime: req.body.new_comment - user.createdAt,
                absTime: req.body.new_comment,
                new_comment: true,
                liked: false,
                flagged: false,
                likes: 0
            };
            user.posts[feedIndex].comments.push(cat);
        }
        // User interacted with a comment on the post.
        else if (req.body.commentID) {
            const commentIndex = _.findIndex(user.posts[feedIndex].comments, function (o) {
                return o.commentID == req.body.commentID && o.new_comment == (req.body.isUserComment == 'true');
            });
            if (commentIndex == -1) {
                console.log("Should not happen.");
            }
            // User liked the comment.
            else if (req.body.like) {
                user.posts[feedIndex].comments[commentIndex].liked = true;
            }
            // User unliked the comment. 
            else if (req.body.unlike) {
                user.posts[feedIndex].comments[commentIndex].liked = false;
            }
            // User flagged the comment.
            else if (req.body.flag) {
                user.posts[feedIndex].comments[commentIndex].flagged = true;
            }
        }
        // User interacted with the post. 
        else {
            // User liked the post.
            if (req.body.like) {
                user.posts[feedIndex].liked = true;
            }
            // User unliked the post.
            if (req.body.unlike) {
                user.posts[feedIndex].liked = false;
            }
        }
        await user.save();
        res.send({ result: "success", numComments: user.numComments });
    } catch (err) {
        next(err);
    }
}