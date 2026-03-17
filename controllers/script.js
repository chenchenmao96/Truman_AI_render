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
const FEED_ORDER_TOKENS = [
    "T13", "T12", "T9", "T5", "T22", "T4", "T20",
    "Park1",
    "T23", "T14", "T25", "T7", "T24", "T8",
    "Park2",
    "T19", "T11", "T17", "T27",
    "Park3",
    "T16", "T1",
    "Cat1",
    "T10", "T15",
    "Food1",
    "T28", "T21", "T3", "T6", "T26",
    "Food2",
    "T18", "T2",
    "Cat2"
];

const AI_TOPICS_BY_PCT = {
    "0": [],
    "10": [9, 27, 23],
    "40": [9, 27, 23, 13, 19, 16, 8, 24, 28, 22, 5],
    "80": [9, 27, 23, 13, 19, 16, 8, 24, 28, 22, 5, 4, 2, 21, 17, 26, 10, 25, 6, 3, 15, 7]
};

function tokenToScriptDescriptor(token, scriptPOL, aiTopicSet) {
    if (/^T\d+$/.test(token)) {
        const topicNum = parseInt(token.slice(1), 10);

        const pictureNum = scriptPOL === "lib"
            ? topicNum * 2
            : topicNum * 2 - 1;

        const isAI = aiTopicSet.has(topicNum);

        let className;
        if (scriptPOL === "lib") {
            className = isAI ? "lAI" : "lreal";
        } else if (scriptPOL === "con") {
            className = isAI ? "cAI" : "creal";
        } else {
            throw new Error(`Invalid scriptPOL: ${scriptPOL}`);
        }

        return {
            key: token,
            class: className,
            picture: `${pictureNum}.jpg`
        };
    }

const fillerMap = {
    Park1: { class: "filler", picture: "park1.jpg" },
    Park2: { class: "filler", picture: "park2.jpg" },
    Park3: { class: "filler", picture: "park3.jpg" },

    Food1: { class: "filler", picture: "food1.jpg" },
    Food2: { class: "filler", picture: "food2.jpg" },

    Cat1: { class: "filler", picture: "cat1.jpg" },
    Cat2: { class: "filler", picture: "cat2.jpg" }
};

    if (!fillerMap[token]) {
        throw new Error(`Unknown feed token: ${token}`);
    }

    return {
        key: token,
        ...fillerMap[token]
    };
}

async function getConditionScripts(scriptPOL, scriptPCT) {
    if (!["lib", "con"].includes(scriptPOL)) {
        throw new Error(`Invalid scriptPOL: ${scriptPOL}`);
    }

    if (!["0", "10", "40", "80"].includes(String(scriptPCT))) {
        throw new Error(`Invalid scriptPCT: ${scriptPCT}`);
    }

    const aiTopicSet = new Set(AI_TOPICS_BY_PCT[String(scriptPCT)]);

    const desired = FEED_ORDER_TOKENS.map(token =>
        tokenToScriptDescriptor(token, scriptPOL, aiTopicSet)
    );

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

    const map = new Map();
    for (const s of scripts) {
        const key = `${s.class}__${s.picture}`;
        if (!map.has(key)) map.set(key, s);
    }

    return desired
        .map(d => {
            const found = map.get(`${d.class}__${d.picture}`);
            if (!found) {
                console.warn(`Missing script: ${d.key} -> class=${d.class}, picture=${d.picture}`);
            }
            return found || null;
        })
        .filter(Boolean);
}

exports.getScriptFeed = async (req, res, next) => {
    try {
        let participantID = Math.floor(Math.random() * 5000000);
        let scriptPCT = String(req.query.PCT || "");
        let scriptPOL = req.query.POL;
        let scriptUID = req.query.UID;
        let admin = req.query.admin;

        if (!scriptUID) {
            return res.status(400).send("Prolific ID is required");
        }

        let existingUser = await User.findOne({ prolificID: scriptUID }).exec();
        console.log("Existing User:", existingUser);

        if (!existingUser) {
            existingUser = new User({
                email: participantID + "@gmail.com",
                password: "password",
                username: participantID,
                PCT: scriptPCT,
                POL: scriptPOL,
                prolificID: scriptUID,
                isAdmin: admin
            });

            await existingUser.save();
        } else {
            scriptPCT = existingUser.PCT || scriptPCT;
            scriptPOL = existingUser.POL || scriptPOL;
            admin = existingUser.isAdmin;
        }

        req.logIn(existingUser, async (err) => {
            if (err) return next(err);

            const one_day = 86400000;
            const time_now = Date.now();
            const time_diff = time_now - req.user.createdAt;
            const user = await User.findById(req.user.id);

            if (!user) {
                throw new Error("User not found");
            }

            const current_day = Math.floor(time_diff / one_day);
            if (current_day < process.env.NUM_DAYS) {
                user.study_days[current_day] += 1;
            }

            if (admin) {
                let script_feed = await Script.find()
                    .sort("-time")
                    .populate("actor")
                    .populate({
                        path: "comments.actor",
                        model: "Actor",
                        options: { strictPopulate: false }
                    })
                    .exec();

                let user_posts = user.getPostInPeriod(0, time_diff);
                user_posts.sort((a, b) => b.relativeTime - a.relativeTime);

                const finalfeed = helpers.getFeed(
                    user_posts,
                    script_feed,
                    user,
                    process.env.FEED_ORDER,
                    true
                );

                await user.save();
                return res.render("script", {
                    script: finalfeed,
                    showNewPostIcon: true,
                    user: user
                });
            }

            // 新实验条件：2 (lib/con) x 4 (0/10/40/80)
            if (
                ["lib", "con"].includes(scriptPOL) &&
                ["0", "10", "40", "80"].includes(scriptPCT)
            ) {
                const script_feed = await getConditionScripts(scriptPOL, scriptPCT);

                if (!script_feed || script_feed.length === 0) {
                    return res.status(404).send("No condition script feed found.");
                }

                let user_posts = user.getPostInPeriod(0, time_diff);
                user_posts.sort((a, b) => b.relativeTime - a.relativeTime);

                const finalfeed = helpers.getFeed(
                    user_posts,
                    script_feed,
                    user,
                    process.env.FEED_ORDER,
                    true,
                    true
                );

                await user.save();

                return res.render("script", {
                    script: finalfeed,
                    script_type: `${scriptPOL}_${scriptPCT}`,
                    user: user
                });
            }

            return res.status(400).send("Invalid POL or PCT condition.");
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
                console.log("HIT DISLIKE BRANCH", req.body.postID);
                console.log("before push:", user.feedAction[feedIndex].dislikeTime);
                const dislike = req.body.dislike;
                user.feedAction[feedIndex].dislikeTime.push(dislike);
                user.feedAction[feedIndex].disliked = true;
                user.numPostDisLikes++;
            }
            // User undisliked the post.
            else if (req.body.undislike) {
                console.log("HIT DISLIKE BRANCH", req.body.postID);
                console.log("before push:", user.feedAction[feedIndex].dislikeTime);
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
            // User disliked the post.
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