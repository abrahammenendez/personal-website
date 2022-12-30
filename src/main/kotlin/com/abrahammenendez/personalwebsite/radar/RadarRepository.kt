package com.abrahammenendez.personalwebsite.radar

import org.bson.types.ObjectId
import org.springframework.data.mongodb.repository.ReactiveMongoRepository
import org.springframework.stereotype.Repository

@Repository
interface RadarRepository : ReactiveMongoRepository<Radar, ObjectId>
