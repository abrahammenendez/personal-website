package com.abrahammenendez.personalwebsite.radar

import com.abrahammenendez.personalwebsite.utils.toObjectId
import kotlinx.coroutines.reactive.awaitFirst
import kotlinx.coroutines.reactor.awaitSingle
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/radars")
class RadarController(
    val radarRepository: RadarRepository,
) {

    @GetMapping
    suspend fun findAll(): Radar {
        return radarRepository.findAll().awaitFirst()
    }

    @GetMapping("/{id}")
    suspend fun get(
        @PathVariable id: String,
    ): Radar {
        return radarRepository.findById(id.toObjectId()).awaitSingle()
    }

    @PostMapping
    suspend fun create(
        @RequestBody radar: Radar,
    ): Radar {
        return radarRepository.save(radar).awaitSingle()
    }

    @PutMapping("/{id}")
    suspend fun update(
        @RequestBody radar: Radar,
    ): Radar {
        return radarRepository.save(radar).awaitSingle()
    }

    @DeleteMapping("/{id}")
    suspend fun delete(
        @PathVariable id: String,
    ) {
        radarRepository.deleteById(id.toObjectId()).awaitSingle()
    }
}
