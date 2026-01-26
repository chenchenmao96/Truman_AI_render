const color_start = '\x1b[33m%s\x1b[0m'; // yellow
const color_success = '\x1b[32m%s\x1b[0m'; // green
const color_error = '\x1b[31m%s\x1b[0m'; // red

console.log(color_start, 'Started populate.js script (no comments version)...');

const Actor = require('./models/Actor.js');
const Script = require('./models/Script.js');
const Notification = require('./models/Notification.js'); // 这里保留，虽然这版脚本不往里写数据
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const CSVToJSON = require('csvtojson');

// Input Files（只有 actor / post，没有 replies）
const actor_inputFile = './input/actors.csv';
const posts_inputFile = './input/lposts.csv';
const politicalPosts_inputFile = './input/cposts.csv';

dotenv.config({ path: '.env' });

mongoose.connect(process.env.MONGODB_URI || process.env.MONGOLAB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;

mongoose.connection.on('error', (err) => {
  console.error(err);
  console.log(color_error, '%s MongoDB connection error. Please make sure MongoDB is running.');
  process.exit(1);
});

// ===== 工具函数 =====

// 把 (+/-)HH:MM 转成毫秒
function timeStringToNum(v) {
  if (!v) return null;
  const timeParts = v.split(':');
  const hours = parseInt(timeParts[0], 10);
  const mins = parseInt(timeParts[1], 10);

  // 注意：负号在 hours 上面
  const sign = hours < 0 ? -1 : 1;
  const absHours = Math.abs(hours);

  const millis = (absHours * 60 + mins) * 60 * 1000;
  return sign * millis;
}

// ===== 主逻辑 =====

async function dropCollectionIfExists(name) {
  const collection = db.collections[name];
  if (!collection) {
    console.log(color_start, `Collection ${name} does not exist, skipping drop.`);
    return;
  }

  try {
    console.log(color_start, `Dropping ${name}...`);
    await collection.drop();
    console.log(color_success, `${name} collection dropped`);
  } catch (err) {
    // 26 = NamespaceNotFound
    if (err.code === 26) {
      console.log(color_start, `Collection ${name} does not exist (code 26), skipping drop.`);
    } else {
      console.log(color_error, `ERROR dropping ${name}:`, err.message);
      throw err;
    }
  }
}

async function doPopulate() {
  try {
    /**** 1. 删除旧数据 ****/
    await dropCollectionIfExists('actors');
    await dropCollectionIfExists('scripts');
    await dropCollectionIfExists('notifications');

    /**** 2. 读取 CSV ****/
    console.log(color_start, 'Reading actors list...');
    const actors_list = await CSVToJSON().fromFile(actor_inputFile);
    console.log(color_success, 'Finished getting the actors_list');

    console.log(color_start, 'Reading posts list...');
    const posts_list = await CSVToJSON().fromFile(posts_inputFile);
    console.log(color_success, 'Finished getting the posts list');

    console.log(color_start, 'Reading political posts list...');
    const political_posts_list = await CSVToJSON().fromFile(politicalPosts_inputFile);
    console.log(color_success, 'Finished getting the political posts list');

    /**** 3. 写入 Actor ****/
    console.log(color_start, 'Starting to populate actors collection...');
    for (const actor_raw of actors_list) {
      const actordetail = {
        username: actor_raw.username,
        profile: {
          name: actor_raw.name,
          gender: actor_raw.gender,
          age: actor_raw.age,
          location: actor_raw.location,
          bio: actor_raw.bio,
          picture: actor_raw.picture,
        },
        class: actor_raw.class,
      };

      const actor = new Actor(actordetail);
      try {
        await actor.save();
      } catch (err) {
        console.log(color_error, 'ERROR: Something went wrong with saving actor in database');
        console.error(err);
        throw err;
      }
    }
    console.log(color_success, 'All actors added to database!');

    /**** 4. 写入 Posts（不包含任何 comments） ****/
    console.log(color_start, 'Starting to populate posts collection...');

    const all_posts = posts_list.concat(political_posts_list);

    for (const new_post of all_posts) {
      const act = await Actor.findOne({ username: new_post.actor }).exec();

      if (!act) {
        console.log(
          color_error,
          `ERROR: Actor "${new_post.actor}" not found in database for post ID ${new_post.id}`
        );
        continue; // 跳过这个 post
      }

      const postdetail = {
        postID: new_post.id,
        body: new_post.body,
        picture: new_post.picture,
        // 直接用 CSV 里的 num_likes / num_shares，如果没有就给 0
        likes: new_post.num_likes ? Number(new_post.num_likes) : 0,
        shares: new_post.num_shares ? Number(new_post.num_shares) : 0,
        actor: act,
        time: timeStringToNum(new_post.time) || null,
        class: new_post.class,
      };

      const script = new Script(postdetail);
      try {
        await script.save();
      } catch (err) {
        console.log(color_error, 'ERROR: Something went wrong with saving post in database');
        console.error(err);
        throw err;
      }
    }

    console.log(color_success, 'All posts added to database!');
  } catch (err) {
    console.log(color_error, 'Populate script failed with error:');
    console.error(err);
  } finally {
    mongoose.connection.close();
    console.log(color_success, 'MongoDB connection closed. populate.js finished.');
  }
}

// 调用主函数
doPopulate();