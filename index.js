require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const playdl = require('play-dl');
const youtube = require('youtube-sr').default;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const token = process.env.TOKEN;
const queue = new Map();

client.on('ready', () => {
  console.log(`✅ 로그인 완료: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const serverQueue = queue.get(message.guild.id);

  if (message.content.startsWith('!재생')) {
    const query = message.content.replace('!재생', '').trim();
    if (!query) return message.reply('🎵 검색할 노래 제목을 입력해주세요!');

    const results = await youtube.search(query, { limit: 3 });
    if (results.length === 0) return message.reply('🔍 검색 결과가 없어요.');

    let reply = '🔎 검색 결과:\n';
    results.forEach((video, index) => {
      reply += `\`${index + 1}\` ▶️ ${video.title} (${video.durationFormatted})\n`;
    });
    reply += '\n숫자를 입력해 노래를 선택하세요 (예: `1`)';
    await message.reply(reply);

    const filter = m => m.author.id === message.author.id && /^[1-3]$/.test(m.content);
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000 });
    if (!collected.size) return message.reply('⏱️ 시간이 초과되었어요.');

    const choice = parseInt(collected.first().content);
    const selected = results[choice - 1];

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('🎧 먼저 음성 채널에 들어가주세요.');

    const song = {
      title: selected.title,
      url: selected.url,
      requestedBy: message.author.username
    };

    if (!serverQueue) {
      const songQueue = {
        textChannel: message.channel,
        voiceChannel: voiceChannel,
        connection: null,
        songs: [song],
        player: createAudioPlayer()
      };
      queue.set(message.guild.id, songQueue);
      playSong(message.guild, songQueue.songs[0]);
    } else {
      serverQueue.songs.push(song);
      message.channel.send(`📥 **${song.title}** 을(를) 대기열에 추가했어요.`);
    }
  }

  if (message.content === '!스킵') {
    if (!serverQueue) return message.reply('⛔ 현재 재생 중인 노래가 없어요!');
    serverQueue.player.stop();
    message.reply('⏭️ 다음 곡으로 넘어갑니다!');
  }

  if (message.content === '!대기열') {
    if (!serverQueue || serverQueue.songs.length === 0) {
      return message.reply('📭 대기열이 비어 있어요!');
    }
    let list = `🎶 현재 재생 중: **${serverQueue.songs[0].title}** (요청자: ${serverQueue.songs[0].requestedBy})\n`;
    if (serverQueue.songs.length > 1) {
      list += '\n📜 대기 중인 곡들:\n';
      serverQueue.songs.slice(1).forEach((song, i) => {
        list += `\`${i + 1}\`. ${song.title} (요청자: ${song.requestedBy})\n`;
      });
    }
    message.channel.send(list);
  }
});

async function playSong(guild, song) {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    if (serverQueue.connection) serverQueue.connection.destroy();
    queue.delete(guild.id);
    return;
  }

  try {
    await new Promise(resolve => setTimeout(resolve, 1500)); // 딜레이

    const stream = await playdl.stream(song.url);
    const resource = createAudioResource(stream.stream, { inputType: stream.type });

    serverQueue.player.play(resource);

    serverQueue.connection = joinVoiceChannel({
      channelId: serverQueue.voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator
    });

    serverQueue.connection.subscribe(serverQueue.player);
    serverQueue.textChannel.send(`▶️ 재생 중: **${song.title}** (요청: ${song.requestedBy})`);

    serverQueue.player.once(AudioPlayerStatus.Idle, () => {
      serverQueue.songs.shift();
      playSong(guild, serverQueue.songs[0]);
    });
  } catch (err) {
    console.error("❌ 오류 발생:", err);
    serverQueue.textChannel.send("⚠️ 이 노래는 재생할 수 없습니다. 다른 곡을 시도해보세요!");
    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  }
}

client.login(token);