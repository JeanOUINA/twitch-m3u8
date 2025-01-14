const { randomBytes } = require('crypto');
const https = require('https');

const clientId = "kimne78kx3ncx6brgo4mv6wki5h1ko";

function getAccessToken(id, isVod) {
	const data = JSON.stringify({
		operationName: "PlaybackAccessToken_Template",
		query: 'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {  streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) {    value    signature    __typename  }  videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) {    value    signature    __typename  }}',
		variables: {
			isLive: !isVod,
			login: (isVod ? "" : id),
			isVod: isVod,
			vodID: (isVod ? id : ""),
			playerType: "site"
		}
	});

	const options = {
		hostname: 'gql.twitch.tv',
		port: 443,
		path: '/gql',
		method: 'POST',
		headers: {
			'Client-id': clientId
		}
	};

	return new Promise((resolve, reject) => {
		const req = https.request(options, (response) => {
			var resData = {};
			resData.statusCode = response.statusCode;
			resData.body = [];
			response.on('data', (chunk) => resData.body.push(chunk));
			response.on('end', () => {
				resData.body = resData.body.join('');

				if (resData.statusCode != 200) {
					reject(new Error(`${JSON.parse(data.body).message}`));
				} else {
					if (isVod) {
						resolve(JSON.parse(resData.body).data.videoPlaybackAccessToken);
					} else {
						resolve(JSON.parse(resData.body).data.streamPlaybackAccessToken);
					}
				}
			});
		});

		req.on('error', (error) => reject(error));
		req.write(data);
		req.end();
	});
}

function formatPlaylistUrl(id, accessToken, vod) {
	return `https://usher.ttvnw.net/${
		vod ? 'vod' : 'api/channel/hls'
	}/${id}.m3u8?token=${encodeURIComponent(
		accessToken.value
	)}&player_backend=mediaplayer&playlist_include_framerate=true&reassignments_supported=true&sig=${
		accessToken.signature
	}&allow_source=true&allow_audio_only=true&player_version=1.21.0&fast_bread=true&play_session_id=${
		randomBytes(16).toString('hex')
	}`
}

function getPlaylist(id, accessToken, vod) {
	return new Promise((resolve, reject) => {
		const req = https.get(formatPlaylistUrl(id, accessToken, vod), (response) => {
			let data = {};
			data.statusCode = response.statusCode;
			data.body = [];
			response.on('data', (chunk) => data.body.push(chunk));
			response.on('end', () => {
				data.body = data.body.join('');

				switch (data.statusCode) {
					case 200:
						resolve(resolve(data.body));
						break;
					case 404:
						reject(new Error('Transcode does not exist - the stream is probably offline'));
						break;
					default:
						reject(new Error(`Twitch returned status code ${data.statusCode}`));
						break;
				}
			});
		})
			.on('error', (error) => reject(error));

		req.end()
	});
}

function parsePlaylist(playlist) {
	const parsedPlaylist = [];
	const lines = playlist.split('\n');
	for (let i = 4; i < lines.length; i += 3) {
		parsedPlaylist.push({
			quality: lines[i - 2].split('NAME="')[1].split('"')[0],
			resolution: (lines[i - 1].indexOf('RESOLUTION') != -1 ? lines[i - 1].split('RESOLUTION=')[1].split(',')[0] : null),
			url: lines[i]
		});
	}
	return parsedPlaylist;
}

function getStream(channel, raw) {
	return getAccessToken(channel, false)
		.then((accessToken) => getPlaylist(channel, accessToken, false))
		.then((playlist) => raw ? playlist : parsePlaylist(playlist))
		.catch(error => reject(error));
}

function getVod(vid, raw) {
	return getAccessToken(vid, true)
		.then((accessToken) => getPlaylist(vid, accessToken, true))
		.then((playlist) => raw ? playlist : parsePlaylist(playlist))
		.catch(error => reject(error));
}

function getPlaylistUrl(id, vod) {
	return getAccessToken(id, false)
		.then((accessToken) => formatPlaylistUrl(id, accessToken, vod))
		.catch(error => reject(error));
}

module.exports = {
	getPlaylistUrl: getPlaylistUrl,
	getStream: getStream,
	getVod: getVod
};
