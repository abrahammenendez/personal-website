package com.abrahammenendez.personalwebsite.utils

import org.bson.types.ObjectId

fun String.toObjectId(): ObjectId {
    return ObjectId(this)
}
