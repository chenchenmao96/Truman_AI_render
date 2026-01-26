function getCountTextNode(btn) {
    return btn.contents().filter(function () {
        return this.nodeType === 3; // text node
    }).get(0);
}

function getCount(btn) {
    const node = getCountTextNode(btn);
    if (!node) return { node: null, count: 0 };
    const count = parseInt(node.nodeValue.trim(), 10) || 0;
    return { node, count };
}

function setCount(btn, newCount) {
    const { node } = getCount(btn);
    if (node) node.nodeValue = ` ${newCount}`;
}

function toggleReaction(e, reactionType) {
    const btn = $(e.target).closest(`.ui.${reactionType}.button`);
    const card = btn.closest(".ui.fluid.card");

    const postID = card.attr("postID");
    const postClass = card.attr("postClass");
    const currDate = Date.now();
    const csrfToken = $('meta[name="csrf-token"]').attr('content');

    // ✅ like / dislike 都用 red
    const activeClass = "red";
    const oppositeType = reactionType === "like" ? "dislike" : "like";
    const oppositeBtn = card.find(`.ui.${oppositeType}.button`);

    let { count: currentCount } = getCount(btn);
    const isActive = btn.hasClass(activeClass);

    function postToServer(payload) {
        if (card.attr("type") === "userPost") {
            $.post("/userPost_feed", { postID, _csrf: csrfToken, ...payload });
        } else {
            $.post("/feed", { postID, postClass, _csrf: csrfToken, ...payload });
        }
    }

    // ✅ 再点一次：取消 reaction
    if (isActive) {
        btn.removeClass(activeClass);
        currentCount -= 1;
        setCount(btn, currentCount);

        postToServer({ [`un${reactionType}`]: currDate });
        return;
    }

    // ✅ 互斥：如果另一边已经点亮，就取消它
    if (oppositeBtn.length && oppositeBtn.hasClass(activeClass)) {
        oppositeBtn.removeClass(activeClass);
        let { count: oppositeCount } = getCount(oppositeBtn);
        oppositeCount -= 1;
        setCount(oppositeBtn, oppositeCount);

        postToServer({ [`un${oppositeType}`]: currDate });
    }

    // ✅ 开启当前 reaction
    btn.addClass(activeClass);
    currentCount += 1;
    setCount(btn, currentCount);

    postToServer({ [reactionType]: currDate });
}


function likePost(e) {
    const target = $(e.target).closest('.ui.like.button');
    const postID = target.closest(".ui.fluid.card").attr("postID");
    const postClass = target.closest(".ui.fluid.card").attr("postClass");
    const currDate = Date.now();
    const csrfToken = $('meta[name="csrf-token"]').attr('content');
    console.log("test to see like inform: ", target);
    // Extract the current like count from the text node inside the button
    const likeTextNode = target.contents().filter(function() {
        return this.nodeType === 3; // Node.TEXT_NODE
    }).get(0);

    console.log("likeTextNode:", likeTextNode);
    let currentLikes = parseInt(likeTextNode.nodeValue.trim(), 10);

    if (target.hasClass("red")) { // Unlike Post
        target.removeClass("red");
        currentLikes -= 1;
        likeTextNode.nodeValue = ` ${currentLikes}`;

        if (target.closest(".ui.fluid.card").attr("type") == 'userPost') {
            $.post("/userPost_feed", {
                postID: postID,
                unlike: currDate,
                _csrf: csrfToken
            });
        } else {
            $.post("/feed", {
                postID: postID,
                unlike: currDate,
                postClass: postClass,
                _csrf: csrfToken
            });
        }
    } else { // Like Post
        target.addClass("red");
        currentLikes += 1;
        likeTextNode.nodeValue = ` ${currentLikes}`;

        if (target.closest(".ui.fluid.card").attr("type") == 'userPost') {
            $.post("/userPost_feed", {
                postID: postID,
                like: currDate,
                _csrf: csrfToken
            });
        } else {
            $.post("/feed", {
                postID: postID,
                like: currDate,
                postClass: postClass,
                _csrf: csrfToken
            });
        }
    }
}


function flagPost(e) {
    const target = $(e.target);
    const flagButton = target.closest('.ui.flag.button'); // Ensure we are targeting the button

    if (!flagButton.hasClass("red")) {
        const post = target.closest(".ui.fluid.card.dim");
        const postID = post.attr("postID");
        const postClass = post.attr("postClass");
        const share = Date.now();

        $.post("/feed", {
            postID: postID,
            share: share,
            postClass: postClass,
            _csrf: $('meta[name="csrf-token"]').attr('content')
        });

        const card = $(`.ui.fluid.card[postID='${postID}']`);
       
        // Find the flag button inside that card
        console.log("Flag button information: ", flagButton);

        // Ensure the flag button contains the correct text node
        const shareTextNode = flagButton.contents().filter(function() {
            return this.nodeType === 3 && this.nodeValue.trim() !== ""; // Node.TEXT_NODE and non-empty
        }).get(0);

        if (shareTextNode) {
            let currentSharesText = shareTextNode.nodeValue.trim();
            console.log("Current shares text:", currentSharesText);

            let currentShares = parseInt(currentSharesText, 10);
            if (!isNaN(currentShares)) {
                let newSharesNum = currentShares + 1; 
                // Update the share text node value
                shareTextNode.nodeValue = ` ${newSharesNum}`;
            } else {
                console.error("Current shares value is not a number:", currentSharesText);
            }
        } else {
            console.error("Share text node not found or contains only whitespace");
        }

        console.log("Share text node:", shareTextNode);
        flagButton.addClass("red"); // Add the class to the button
    } else {

        const post = target.closest(".ui.fluid.card.dim");
        const postID = post.attr("postID");
        const postClass = post.attr("postClass");
        const unshare = Date.now();

        $.post("/feed", {
            postID: postID,
            unshare: unshare,
            postClass: postClass,
            _csrf: $('meta[name="csrf-token"]').attr('content')
        });

        const card = $(`.ui.fluid.card[postID='${postID}']`);
       
        // Find the flag button inside that card
        console.log("Flag button information: ", flagButton);

        // Ensure the flag button contains the correct text node
        const shareTextNode = flagButton.contents().filter(function() {
            return this.nodeType === 3 && this.nodeValue.trim() !== ""; // Node.TEXT_NODE and non-empty
        }).get(0);

        if (shareTextNode) {
            let currentSharesText = shareTextNode.nodeValue.trim();
            console.log("Current shares text:", currentSharesText);

            let currentShares = parseInt(currentSharesText, 10);
            if (!isNaN(currentShares)) {
                let newSharesNum = currentShares - 1; 
                // Update the share text node value
                shareTextNode.nodeValue = ` ${newSharesNum}`;
            } else {
                console.error("Current shares value is not a number:", currentSharesText);
            }
        } else {
            console.error("Share text node not found or contains only whitespace");
        }

        console.log("Share text node:", shareTextNode);
        flagButton.removeClass("red"); // Add the class to the button
       
    }
}



function likeComment(e) {
    const target = $(e.target);
    const comment = target.parents(".comment");
    const label = comment.find("span.num");

    const postID = target.closest(".ui.fluid.card").attr("postID");
    const postClass = target.closest(".ui.fluid.card").attr("postClass");
    const commentID = comment.attr("commentID");
    const isUserComment = comment.find("a.author").attr('href') === '/me';
    const currDate = Date.now();

    if (target.hasClass("red")) { //Unlike comment
        target.removeClass("red");
        comment.find("i.heart.icon").removeClass("red");
        target.html('Like');
        label.html(function(i, val) { return val * 1 - 1 });

        if (target.closest(".ui.fluid.card").attr("type") == 'userPost') {
            $.post("/userPost_feed", {
                postID: postID,
                commentID: commentID,
                unlike: currDate,
                isUserComment: isUserComment,
                _csrf: $('meta[name="csrf-token"]').attr('content')
            });
        } else {
            $.post("/feed", {
                postID: postID,
                commentID: commentID,
                unlike: currDate,
                isUserComment: isUserComment,
                postClass: postClass,
                _csrf: $('meta[name="csrf-token"]').attr('content')
            });
        }
    } else { //Like comment
        target.addClass("red");
        comment.find("i.heart.icon").addClass("red");
        target.html('Unlike');
        label.html(function(i, val) { return val * 1 + 1 });

        if (target.closest(".ui.fluid.card").attr("type") == 'userPost')
            $.post("/userPost_feed", {
                postID: postID,
                commentID: commentID,
                like: currDate,
                isUserComment: isUserComment,
                _csrf: $('meta[name="csrf-token"]').attr('content')
            });
        else
            $.post("/feed", {
                postID: postID,
                commentID: commentID,
                like: currDate,
                isUserComment: isUserComment,
                postClass: postClass,
                _csrf: $('meta[name="csrf-token"]').attr('content')
            });
    }
}

function flagComment(e) {
    const target = $(e.target);
    const comment = target.parents(".comment");
    const postID = target.closest(".ui.fluid.card").attr("postID");
    const postClass = target.closest(".ui.fluid.card").attr("postClass");
    const commentID = comment.attr("commentID");
    comment.replaceWith(`
        <div class="comment" commentID="${commentID}" style="background-color:black;color:white">
            <h5 class="ui inverted header" style="padding-bottom: 0.5em; padding-left: 0.5em;">
                You have shared this post.
            </h5>
        </div>`);
    const flag = Date.now();

    if (target.closest(".ui.fluid.card").attr("type") == 'userPost')
        console.log("Should never be here.")
    else
        $.post("/feed", {
            postID: postID,
            commentID: commentID,
            flag: flag,
            postClass: postClass,
            _csrf: $('meta[name="csrf-token"]').attr('content')
        });
}

function addComment(e) {
    const target = $(e.target);
    const text = target.siblings(".ui.form").find("textarea.newcomment").val().trim();
    const card = target.parents(".ui.fluid.card");
    let comments = card.find(".ui.comments");
    const postClass = target.closest(".ui.fluid.card").attr("postClass");
    //no comments area - add it
    if (!comments.length) {
        const buttons = card.find(".ui.bottom.attached.icon.buttons")
        buttons.after('<div class="content"><div class="ui comments"></div>');
        comments = card.find(".ui.comments")
    }
    if (text.trim() !== '') {
        const currDate = Date.now();
        const ava = target.siblings('.ui.label').find('img.ui.avatar.image');
        const ava_img = ava.attr("src");
        const ava_name = ava.attr("name");
        const postID = card.attr("postID");
        const commentID = numComments + 1;

        const mess = `
        <div class="comment" commentID=${commentID}>
            <a class="avatar"><img src="${ava_img}"></a>
            <div class="content"> 
                <a class="author" href="/me">${ava_name}</a>
                <div class="metadata"> 
                    <span class="date">${humanized_time_span(currDate)}</span>
                    <i class="heart icon"></i> 
                    <span class="num"> 0 </span> Likes
                </div> 
                <div class="text">${text}</div>
                <div class="actions"> 
                    <a class="like comment" onClick="likeComment(event)">Like</a> 
                </div> 
            </div>
        </div>`;
        $(this).siblings(".ui.form").find("textarea.newcomment").val('');
        comments.append(mess);

        const newCommentCount = comments.children().length;
        //alert("comment length: " + newCommentCount); // Correct usage of alert
        updateCommentCount(postID, newCommentCount);

        if (card.attr("type") == 'userPost')
            $.post("/userPost_feed", {
                postID: postID,
                new_comment: currDate,
                comment_text: text,
                _csrf: $('meta[name="csrf-token"]').attr('content')
            }).then(function(json) {
                numComments = json.numComments;
            });
        else
            $.post("/feed", {
                postID: postID,
                new_comment: currDate,
                comment_text: text,
                postClass: postClass,
                _csrf: $('meta[name="csrf-token"]').attr('content')
            }).then(function(json) {
                numComments = json.numComments;
            });
    }
}

function updateCommentCount(postID, newCommentCount) {
    // Find the card with the given postID
    const card = $(`.ui.fluid.card[postID='${postID}']`);
    // Find the reply button inside that card
    const replyButton = card.find('.ui.reply.button');
    // Find the text node containing the comment count
    const commentTextNode = replyButton.contents().filter(function() {
        return this.nodeType === 3; // Node.TEXT_NODE
    }).get(0);
    // Update the comment count
    if (commentTextNode) {
        commentTextNode.nodeValue = ` ${newCommentCount}`;
    } else {
        console.error("Comment text node not found");
    }
}

function followUser(e) {
    const target = $(e.target);
    const username = target.attr('actor_un');
    if (target.text().trim() == "Follow") { //Follow Actor
        $(`.ui.basic.primary.follow.button[actor_un='${username}']`).each(function(i, element) {
            const button = $(element);
            button.text("Following");
            button.prepend("<i class='check icon'></i>");
        })
        $.post("/user", {
            followed: username,
            _csrf: $('meta[name="csrf-token"]').attr('content')
        })
    } else { //Unfollow Actor
        $(`.ui.basic.primary.follow.button[actor_un='${username}']`).each(function(i, element) {
            const button = $(element);
            button.text("Follow");
            button.find('i').remove();
        })
        $.post("/user", {
            unfollowed: username,
            _csrf: $('meta[name="csrf-token"]').attr('content')
        })
    }
}

$(window).on('load', () => {
    //add humanized time to all posts
    $('.right.floated.time.meta, .date').each(function() {
        const ms = parseInt($(this).text(), 10);
        const time = new Date(ms);
        const humanizedTime = humanized_time_span(time);
        // Update the element's HTML while preserving the <strong> tag
        if ($(this).hasClass('actorPost')) {
            $(this).html('<strong style="color: black;">' + humanizedTime + '</strong>');
        } else {
            $(this).text(humanizedTime);
        }
    });

    // ************ Actions on Main Post ***************
    // Focus new comment element if "Reply" button is clicked
    $('.reply.button').on('click', function() {
        let parent = $(this).closest(".ui.fluid.card");
        parent.find("textarea.newcomment").focus();
    });

    // Press enter to submit a comment
    $("textarea.newcomment").keydown(function(event) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.stopImmediatePropagation();
            $(this).parents(".ui.form").siblings("i.big.send.link.icon").click();
        }
    });

    //Create a new Comment
    $("i.big.send.link.icon").on('click', addComment);

    //Like/Unlike Post
    //$('.like.button').on('click', likePost);
    $('.like.button').on('click', (e) => toggleReaction(e, 'like'));
    $('.dislike.button').on('click', (e) => toggleReaction(e, 'dislike'));

    //Flag Post
    $('.flag.button').on('click', flagPost);
    
    // ************ Actions on Comments***************
    // Like/Unlike comment
    $('a.like.comment').on('click', likeComment);

    //Flag comment
    $('a.flag.comment').on('click', flagComment);

    //Follow button
    $('.ui.basic.primary.follow.button').on('click', followUser);

    // Track how long a post is on the screen (borders are defined by image)
    // Start time: When the entire photo is visible in the viewport.
    // End time: When the entire photo is no longer visible in the viewport.
    $('.ui.fluid.card .img.post').visibility({
        once: false,
        continuous: false,
        observeChanges: true,
        //throttle:100,
        initialCheck: true,
        offset: 50,

        //Handling scrolling down like normal
        //Called when bottomVisible turns true (bottom of a picture is visible): bottom can enter from top or bottom of viewport
        onBottomVisible: function(element) {
            var startTime = parseInt($(this).siblings(".content").children(".myTimer").text());
            // Bottom of picture enters from bottom (scrolling down the feed; as normal)
            if (element.topVisible) { // Scrolling Down AND entire post is visible on the viewport 
                // If this is the first time bottom is visible
                if (startTime == 0) {
                    var startTime = Date.now();
                }
            } else { //Scrolling up and this event does not matter, since entire photo isn't visible anyways.
                var startTime = 0;
            }
            $(this).siblings(".content").children(".myTimer").text(startTime);
        },

        //Element's bottom edge has passed top of the screen (disappearing); happens only when Scrolling Up
        onBottomPassed: function(element) {
            var endTime = Date.now();
            var startTime = parseInt($(this).siblings(".content").children(".myTimer").text());
            var totalViewTime = endTime - startTime; //TOTAL TIME HERE

            var parent = $(this).parents(".ui.fluid.card");
            var postID = parent.attr("postID");
            var postClass = parent.attr("postClass");
            // If user viewed it for less than 24 hours, but more than 1.5 seconds (just in case)
            if (totalViewTime < 86400000 && totalViewTime > 1500 && startTime > 0) {
                $.post("/feed", {
                    postID: postID,
                    viewed: totalViewTime,
                    postClass: postClass,
                    _csrf: $('meta[name="csrf-token"]').attr('content')
                });
                // Reset Timer
                $(this).siblings(".content").children(".myTimer").text(0);
            }
        },

        //Handling scrolling up
        //Element's top edge has passed top of the screen (appearing); happens only when Scrolling Up
        onTopPassedReverse: function(element) {
            var startTime = parseInt($(this).siblings(".content").children(".myTimer").text());
            if (element.bottomVisible && startTime == 0) { // Scrolling Up AND entire post is visible on the viewport 
                var startTime = Date.now();
                $(this).siblings(".content").children(".myTimer").text(startTime);
            }
        },

        // Called when topVisible turns false (exits from top or bottom)
        onTopVisibleReverse: function(element) {
            if (element.topPassed) { //Scrolling Down, disappears on top; this event doesn't matter (since it is when bottom disappears that time is stopped)
            } else { // False when Scrolling Up (the bottom of photo exits screen.)
                var endTime = Date.now();
                var startTime = parseInt($(this).siblings(".content").children(".myTimer").text());
                var totalViewTime = endTime - startTime;

                var parent = $(this).parents(".ui.fluid.card");
                var postID = parent.attr("postID");
                var postClass = parent.attr("postClass");
                // If user viewed it for less than 24 hours, but more than 1.5 seconds (just in case)
                if (totalViewTime < 86400000 && totalViewTime > 1500 && startTime > 0) {
                    $.post("/feed", {
                        postID: postID,
                        viewed: totalViewTime,
                        postClass: postClass,
                        _csrf: $('meta[name="csrf-token"]').attr('content')
                    });
                    // Reset Timer
                    $(this).siblings(".content").children(".myTimer").text(0);
                }
            }
        }
    });
});