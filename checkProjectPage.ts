const fs = require("fs")
const axios = require('axios')

const ONE_SECOND = 1000;
const ONE_MINUTE = ONE_SECOND * 60;
const ONE_HOUR = ONE_MINUTE * 60;
const ONE_DAY = ONE_HOUR * 24;
const ONE_WEEK = 7 * ONE_DAY;

// the index of different type's topic in config file
enum UserConfigIdx {
    USERNAME = 'bbsUsername',
    READINGLIST = 'readingListId',
    IDEALIST = 'ideaListId',
    PROJECTPAGE = 'projectPageId',
}

// map bbs-name with real name
interface Wechat2topicId {
    [wechatusername: string]: {
        bbsUsername: string;
        readingListId: string;
        ideaListId: string;
        projectPageId: string;
        skip?: boolean;
    }
}

interface Config {
    wechat2topicId: Wechat2topicId
    host: string
    // path: string;
    apiKey: string
    apiUsername: string
    projectPageWarningTopicId: number
}

interface PostRes {
    user_id: number
    username: string
    created_at: string
    raw: string
}

interface TopicRes {
    post_stream: {
        posts: PostRes[];
        stream: number[];
    }
}

interface Topic {
    title: string
    raw: string
    category: number
    created_at?: number
}

interface Post {
    topic_id: number
    raw: string
    created_at?: number
}

// main 
const config: Config = JSON.parse(fs.readFileSync('config.json', 'utf-8'))['modules']['GroupBBS']
const wechat2topicId: Wechat2topicId = config.wechat2topicId // {[name:string]:[usernameOnBBS:string, rlId:string, ilId:string]}
const host = config.host
const apiKey = config.apiKey
const apiUsername = config.apiUsername
const apiQs = {
    api_key: apiKey,
    api_username: apiUsername,
}
const projectPageWarningTopicId = config.projectPageWarningTopicId

checkProjectPage()



async function checkProjectPage() {
    const usersToBeReminded = await checkPost(UserConfigIdx.PROJECTPAGE)
    // console.log("output:")
    // console.log(usersToBeReminded)
    await postProjectPageWarning(usersToBeReminded)

}

async function checkPost(topicIdIndex: string) {
    const today = new Date()
    const usersToBeReminded: { [username: string]: number } = {}
    const users = Object.keys(wechat2topicId)
    for (const user of users) {
        if (wechat2topicId[user].skip) {
            continue
        }

        const topicId = wechat2topicId[user][topicIdIndex]
        if (!topicId) {
            continue
        }
        const authorUsername = wechat2topicId[user][UserConfigIdx.USERNAME]
        // console.debug(`check ${authorUsername}'s ${topicIdIndex}`);
        try {
            // console.log("=====", `${host}/t/${topicId}.json`, "======")
            let options = {
                method: 'GET',
                headers: {
                    "Api-Key": apiKey,
                    "Api-Username": apiUsername
                },
                data: '',
                url: `${host}/t/${topicId}.json`
            }
            const topic: TopicRes = (await axios(options)).data
            const { post_stream: postStream } = topic

            let lastAuthorUsername
            let minDiff = Infinity
            let tryTimes = 0
            do {
                const lastPostId = postStream.stream.pop()
                let options = {
                    method: 'GET',
                    headers: {
                        "Api-Key": apiKey,
                        "Api-Username": apiUsername
                    },
                    data: '',
                    url: `${host}/posts/${lastPostId}.json`
                }
                const post = (await axios(options)).data
                lastAuthorUsername = post.username
                ++tryTimes
                if (authorUsername === lastAuthorUsername) {
                    minDiff = Math.min(timeDiffInMS(new Date(post.created_at), today), minDiff)
                }
            } while (authorUsername !== lastAuthorUsername && tryTimes < 20)

            if (minDiff > ONE_WEEK) {
                usersToBeReminded[user] = Math.round(minDiff / ONE_DAY)
            }
        } catch (err) {
            console.log(`err at ${user}, err: ${err}`)
            continue
        }
    }

    return usersToBeReminded
}

async function postProjectPageWarning(usersToBeReminded) {
    let msg = Object.keys(usersToBeReminded).reduce((text, wechatUsername) => {
        const bbsUserName = wechat2topicId[wechatUsername][UserConfigIdx.USERNAME]

        return text += `@${bbsUserName} ${wechatUsername} has not post the project page for ${usersToBeReminded[wechatUsername]} days  \n`
    }, '')

    // every one post
    if (msg === '') {
        msg = 'Everyone has posted the project page!'
    }
    // console.log(msg)

    const post: Post = {
        topic_id: projectPageWarningTopicId, // hardCode
        raw: msg
    }
    // console.log(JSON.stringify(post))
    await postTopicOrPost(post)
}

async function postTopicOrPost(topic: Topic | Post) {
    // const params = { api_key: this.apiKey, api_username: this.apiUsername }
    try {
        let options = {
            method: 'POST',
            headers: {
                "Api-Key": apiKey,
                "Api-Username": apiUsername
            },
            data: topic,
            url: `${host}/posts.json`
        }
        await axios(options)
        // await axios.post(`${host}/posts.json`, topic, { params })
    } catch (err) {
        console.log(`err at postTopicOrPost: ${err}`)
    }
}

function timeDiffInMS(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()));
}